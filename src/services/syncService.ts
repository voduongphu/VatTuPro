import { StorageService } from './storage';
import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  OutboundReceipt,
  TombstoneMap,
  ActiveUserSession
} from '../types/inventory';
import {
  normKey,
  normUserKey,
  computeMetaDigest,
  computeMaterialsDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest
} from '../utils/additiveMerge';

interface ManifestReceiptEntry {
  code: string;
  receiptCode?: string;
  issueCode?: string;
  id: string;
  itemCount: number;
  updatedAt: number;
  digest: string;
}

interface ServerManifest {
  serverRevision: number;
  materialsRevision: number;
  materialsCount: number;
  materialsDigest: string;
  metaDigest: string;
  activeSessions?: Record<string, ActiveUserSession>;
  users: User[];
  warehouses: Warehouse[];
  tombstones: TombstoneMap;
  inboundManifest: ManifestReceiptEntry[];
  outboundManifest: ManifestReceiptEntry[];
}

export interface SessionInvalidationInfo {
  reason: 'replaced' | 'disabled' | 'expired';
  username?: string;
  fullName?: string;
  deviceLabel?: string;
  loginAt?: string;
}

export interface UnifiedAuthSession {
  user: User;
  session: ActiveUserSession;
}

const CLIENT_ID = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DEVICE_ID_STORAGE_KEY = 'vtp_device_id_v1';
const UNIFIED_SESSION_STORAGE_KEY = 'vtp_auth_session_v5';
const KICK_NOTICE_STORAGE_KEY = 'vtp_session_kick_notice_v1';
const STATIC_SESSIONS_STORAGE_KEY = 'vtp_static_active_sessions_v1';
const LEGACY_SESSION_KEYS = [
  'vtp_inventory_session_v3',
  'vtp_active_session_v1',
  'vtp_inventory_current_user_v2',
  'vtp_inventory_current_user'
];
const AUTH_BROADCAST_CHANNEL = 'vtp_single_session_v2';

// Mỗi gói HTTP tối đa 2.500 - 3.500 dòng (~1.1 - 1.4MB) đảm bảo không chạm giới hạn Vercel (4.5MB) & Cloud Run kể cả >100.000 dòng
const PUSH_ITEM_CHUNK_SIZE = 2500;
const PULL_MATERIAL_PAGE_SIZE = 3500;

let isStarted = false;
let isReconciling = false;
let pendingReconcile = false;
let isVerifyingSession = false;
let metaDirty = false;
let materialsDirty = false;
let lastKnownServerRev = 0;
let lastPulledMaterialsRev = 0;
let lastInteractionCheckMs = 0;
let wsFailCount = 0;
let nextWsAllowedAtMs = 0;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let sessionHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let authChannel: BroadcastChannel | null = null;

// Lưu thông báo đá phiên nếu xảy ra trong lúc Bootstrap trước khi AuthProvider kịp mount
let pendingInvalidation: SessionInvalidationInfo | null = null;

const syncStateListeners = new Set<(syncing: boolean) => void>();
const sessionInvalidatedListeners = new Set<(info: SessionInvalidationInfo) => void>();

function purgeLegacySessionKeys(): void {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

function notifySyncState(syncing: boolean): void {
  syncStateListeners.forEach((cb) => {
    try {
      cb(syncing);
    } catch {
      // ignore
    }
  });
}

function notifySessionInvalidated(info: SessionInvalidationInfo): void {
  if (sessionInvalidatedListeners.size === 0) {
    pendingInvalidation = info;
    return;
  }
  pendingInvalidation = null;
  sessionInvalidatedListeners.forEach((cb) => {
    try {
      cb(info);
    } catch {
      // ignore
    }
  });
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `dev-${crypto.randomUUID()}`
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return CLIENT_ID;
  }
}

export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Thiết bị Web';
  const ua = navigator.userAgent || '';
  let browser = 'Trình duyệt';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('CriOS/')) browser = 'Chrome';
  else if (ua.includes('FxiOS/')) browser = 'Firefox';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Máy tính';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} trên ${os}`;
}

function getStoredUnifiedSession(): UnifiedAuthSession | null {
  try {
    const raw = sessionStorage.getItem(UNIFIED_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UnifiedAuthSession;
    if (
      parsed &&
      parsed.user &&
      parsed.user.id &&
      parsed.session &&
      parsed.session.userKey &&
      parsed.session.sessionToken &&
      !parsed.session.sessionToken.startsWith('offline-')
    ) {
      return parsed;
    }
    sessionStorage.removeItem(UNIFIED_SESSION_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function saveStoredUnifiedSession(unified: UnifiedAuthSession): void {
  purgeLegacySessionKeys();
  try {
    sessionStorage.setItem(UNIFIED_SESSION_STORAGE_KEY, JSON.stringify(unified));
  } catch {
    // ignore
  }
}

function clearStoredUnifiedSession(): void {
  purgeLegacySessionKeys();
  try {
    sessionStorage.removeItem(UNIFIED_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function savePersistedKickNotice(info: SessionInvalidationInfo): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KICK_NOTICE_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // ignore
  }
}

function readPersistedKickNotice(): SessionInvalidationInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KICK_NOTICE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionInvalidationInfo;
    if (parsed && parsed.reason) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function clearPersistedKickNotice(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KICK_NOTICE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function triggerLocalKickOut(info: SessionInvalidationInfo): void {
  const current = getStoredUnifiedSession();
  const enriched: SessionInvalidationInfo = {
    ...info,
    username: info.username || current?.user.username,
    fullName: info.fullName || current?.user.fullName
  };
  clearStoredUnifiedSession();
  if (!current && sessionInvalidatedListeners.size === 0) {
    return;
  }
  savePersistedKickNotice(enriched);
  notifySessionInvalidated(enriched);
}

class ApiRouteMissingError extends Error {
  constructor(url: string, status: number) {
    super(`API route missing (${status}) on ${url}`);
    this.name = 'ApiRouteMissingError';
  }
}

function getStaticSessionsMap(): Record<string, ActiveUserSession> {
  try {
    const raw = localStorage.getItem(STATIC_SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStaticSessionEntry(userKey: string, session: ActiveUserSession | null): void {
  try {
    const map = getStaticSessionsMap();
    if (session) {
      map[userKey] = session;
    } else {
      delete map[userKey];
    }
    localStorage.setItem(STATIC_SESSIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (url.startsWith('/api/sync')) {
    const current = getStoredUnifiedSession();
    if (current && !current.session.sessionToken.startsWith('static-')) {
      headers.set('x-auth-user-key', encodeURIComponent(current.session.userKey));
      headers.set('x-auth-session-token', current.session.sessionToken);
      headers.set('x-auth-device-id', encodeURIComponent(current.session.deviceId));
      headers.set('x-auth-device-label', encodeURIComponent(current.session.deviceLabel));
    }
  }

  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers
  });

  const invalidatedReason = res.headers.get('X-Auth-Invalidated');
  if (invalidatedReason && getStoredUnifiedSession()) {
    let replacedBy: ActiveUserSession | undefined;
    const rawReplaced = res.headers.get('X-Auth-Replaced-By');
    if (rawReplaced) {
      try {
        replacedBy = JSON.parse(decodeURIComponent(rawReplaced)) as ActiveUserSession;
      } catch {
        // ignore
      }
    }
    if (invalidatedReason === 'disabled') {
      triggerLocalKickOut({ reason: 'disabled' });
    } else if (invalidatedReason === 'replaced') {
      triggerLocalKickOut({
        reason: 'replaced',
        deviceLabel: replacedBy?.deviceLabel,
        loginAt: replacedBy?.loginAt
      });
    } else {
      triggerLocalKickOut({ reason: 'expired' });
    }
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || res.status === 405 || contentType.includes('text/html')) {
    throw new ApiRouteMissingError(url, res.status);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return (await res.json()) as T;
}

function sendWsAuthCheck(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const current = getStoredUnifiedSession();
  if (!current || current.session.sessionToken.startsWith('static-')) return;
  try {
    ws.send(
      JSON.stringify({
        type: 'auth:check',
        userKey: current.session.userKey,
        sessionToken: current.session.sessionToken
      })
    );
  } catch {
    // ignore
  }
}

async function verifySessionHeartbeat(): Promise<void> {
  if (isVerifyingSession) return;
  const current = getStoredUnifiedSession();
  if (!current) return;

  isVerifyingSession = true;
  try {
    const mySession = current.session;

    // Nếu đang ở môi trường tĩnh chưa có /api, kiểm tra bảng phiên tĩnh đồng bộ giữa các cửa sổ trình duyệt
    if (mySession.sessionToken.startsWith('static-')) {
      const staticMap = getStaticSessionsMap();
      const activeStatic = staticMap[mySession.userKey];
      if (activeStatic && activeStatic.sessionToken !== mySession.sessionToken) {
        triggerLocalKickOut({
          reason: 'replaced',
          deviceLabel: activeStatic.deviceLabel,
          loginAt: activeStatic.loginAt
        });
      }
      return;
    }

    const res = await fetchJson<{
      valid: boolean;
      reason?: 'replaced' | 'disabled' | 'expired' | 'missing';
      replacedBy?: ActiveUserSession;
    }>('/api/auth/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: mySession.userId,
        username: mySession.username,
        userKey: mySession.userKey,
        sessionToken: mySession.sessionToken,
        deviceId: mySession.deviceId,
        deviceLabel: mySession.deviceLabel,
        loginAt: mySession.loginAt
      })
    });

    const latestLocal = getStoredUnifiedSession();
    if (!latestLocal || latestLocal.session.sessionToken !== mySession.sessionToken) {
      return;
    }

    if (!res.valid) {
      if (res.reason === 'disabled') {
        triggerLocalKickOut({ reason: 'disabled' });
      } else if (res.reason === 'replaced') {
        triggerLocalKickOut({
          reason: 'replaced',
          deviceLabel: res.replacedBy?.deviceLabel,
          loginAt: res.replacedBy?.loginAt
        });
      } else {
        triggerLocalKickOut({ reason: 'expired' });
      }
    }
  } catch {
    // Tạm thời bỏ qua lỗi mạng chập chờn, sẽ kiểm tra lại ở nhịp 1.5 giây kế tiếp
  } finally {
    isVerifyingSession = false;
  }
}

function inspectManifestActiveSessions(activeSessions?: Record<string, ActiveUserSession>): boolean {
  const current = getStoredUnifiedSession();
  if (!current || !activeSessions) return true;

  // Nếu trước đó đang dùng phiên tĩnh dự phòng mà nay máy chủ /api đã hoạt động, yêu cầu xác thực lại phiên máy chủ
  if (current.session.sessionToken.startsWith('static-')) {
    triggerLocalKickOut({ reason: 'expired' });
    return false;
  }

  const mySession = current.session;
  const remote = activeSessions[mySession.userKey];
  if (!remote) {
    return true;
  }

  if (remote.sessionToken !== mySession.sessionToken) {
    triggerLocalKickOut({
      reason: 'replaced',
      deviceLabel: remote.deviceLabel,
      loginAt: remote.loginAt
    });
    return false;
  }

  return true;
}

async function pullMissingReceipts(type: 'inbound' | 'outbound', codesToPull: string[]): Promise<void> {
  let queue = [...codesToPull];

  while (queue.length > 0) {
    const batchCodes = queue.slice(0, 80);
    const remainingAfterBatch = queue.slice(80);

    const resp = await fetchJson<{
      receipts: Array<InboundReceipt | OutboundReceipt>;
      remainingLargeCodes: Array<{ code: string; nextOffset: number; totalItems: number }>;
      unprocessedCodes: string[];
    }>('/api/sync/receipts-batch-pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, codes: batchCodes })
    });

    if (resp.receipts && resp.receipts.length > 0) {
      if (type === 'inbound') {
        StorageService.applyRemoteInboundReceipts(resp.receipts as InboundReceipt[]);
      } else {
        StorageService.applyRemoteOutboundReceipts(resp.receipts as OutboundReceipt[]);
      }
    }

    if (resp.remainingLargeCodes && resp.remainingLargeCodes.length > 0) {
      for (const large of resp.remainingLargeCodes) {
        let offset = large.nextOffset;
        let hasMore = offset < large.totalItems;
        while (hasMore) {
          const chunkResp = await fetchJson<{
            receipt: InboundReceipt | OutboundReceipt;
            nextOffset: number;
            totalItems: number;
            hasMore: boolean;
          }>(`/api/sync/receipt-chunk?type=${type}&code=${encodeURIComponent(large.code)}&offset=${offset}&limit=5000`);

          if (type === 'inbound') {
            StorageService.applyRemoteInboundReceipts([chunkResp.receipt as InboundReceipt]);
          } else {
            StorageService.applyRemoteOutboundReceipts([chunkResp.receipt as OutboundReceipt]);
          }
          offset = chunkResp.nextOffset;
          hasMore = chunkResp.hasMore;
        }
      }
    }

    queue = [...(resp.unprocessedCodes || []), ...remainingAfterBatch];
  }
}

async function pushReceiptsChunked(
  type: 'inbound' | 'outbound',
  receiptsToPush: Array<InboundReceipt | OutboundReceipt>
): Promise<void> {
  if (receiptsToPush.length === 0) return;

  const batches: Array<Array<InboundReceipt | OutboundReceipt>> = [];
  let currentBatch: Array<InboundReceipt | OutboundReceipt> = [];
  let currentItemCount = 0;

  for (let i = 0; i < receiptsToPush.length; i++) {
    const rcp = receiptsToPush[i];
    const items = rcp.items || [];

    if (items.length <= PUSH_ITEM_CHUNK_SIZE) {
      if (currentItemCount > 0 && currentItemCount + items.length > PUSH_ITEM_CHUNK_SIZE) {
        batches.push(currentBatch);
        currentBatch = [];
        currentItemCount = 0;
      }
      currentBatch.push(rcp);
      currentItemCount += items.length;
    } else {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentItemCount = 0;
      }
      for (let start = 0; start < items.length; start += PUSH_ITEM_CHUNK_SIZE) {
        const slice = items.slice(start, start + PUSH_ITEM_CHUNK_SIZE);
        batches.push([{ ...rcp, items: slice } as InboundReceipt | OutboundReceipt]);
      }
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  for (let b = 0; b < batches.length; b++) {
    const isLast = b === batches.length - 1;
    const res = await fetchJson<{ serverRevision: number }>('/api/sync/receipts-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        type,
        receipts: batches[b],
        suppressBroadcast: !isLast
      })
    });
    if (res.serverRevision) {
      lastKnownServerRev = Math.max(lastKnownServerRev, res.serverRevision);
    }
  }
}

async function pullAllMaterials(): Promise<void> {
  let offset = 0;
  let hasMore = true;
  let latestRev = lastPulledMaterialsRev;

  while (hasMore) {
    const page = await fetchJson<{
      items: MaterialItem[];
      total: number;
      hasMore: boolean;
      materialsRevision: number;
    }>(`/api/sync/materials?offset=${offset}&limit=${PULL_MATERIAL_PAGE_SIZE}`);

    if (page.items && page.items.length > 0) {
      StorageService.applyRemoteMaterials(page.items);
      offset += page.items.length;
    } else {
      break;
    }
    latestRev = page.materialsRevision;
    hasMore = page.hasMore;
  }

  lastPulledMaterialsRev = latestRev;
}

async function pushAllMaterialsChunked(): Promise<void> {
  const mats = StorageService.getMaterials();
  const tombstones = StorageService.getTombstones();

  if (mats.length === 0 && Object.keys(tombstones.materials).length === 0) {
    materialsDirty = false;
    return;
  }

  if (mats.length === 0) {
    const res = await fetchJson<{ materialsRevision: number; serverRevision: number }>('/api/sync/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        items: [],
        tombstones: tombstones.materials,
        suppressBroadcast: false
      })
    });
    lastPulledMaterialsRev = res.materialsRevision;
    lastKnownServerRev = Math.max(lastKnownServerRev, res.serverRevision);
    materialsDirty = false;
    return;
  }

  const totalChunks = Math.ceil(mats.length / PUSH_ITEM_CHUNK_SIZE);
  for (let c = 0; c < totalChunks; c++) {
    const slice = mats.slice(c * PUSH_ITEM_CHUNK_SIZE, (c + 1) * PUSH_ITEM_CHUNK_SIZE);
    const isLast = c === totalChunks - 1;
    const res = await fetchJson<{ materialsRevision: number; serverRevision: number }>('/api/sync/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        items: slice,
        tombstones: c === 0 ? tombstones.materials : undefined,
        suppressBroadcast: !isLast
      })
    });
    lastPulledMaterialsRev = res.materialsRevision;
    lastKnownServerRev = Math.max(lastKnownServerRev, res.serverRevision);
  }
  materialsDirty = false;
}

async function reconcileInternal(): Promise<void> {
  if (isReconciling) {
    pendingReconcile = true;
    return;
  }

  isReconciling = true;
  notifySyncState(true);

  try {
    const manifest = await fetchJson<ServerManifest>(`/api/sync/manifest?t=${Date.now()}`);

    // Bước 0: Kiểm tra nghiêm ngặt hiệu lực phiên đăng nhập 1 thiết bị / 1 tài khoản
    inspectManifestActiveSessions(manifest.activeSessions);

    // Bước 1: Đồng bộ cộng gộp Users + Warehouses + Tombstones từ Server trước
    StorageService.applyRemoteMeta({
      users: manifest.users,
      warehouses: manifest.warehouses,
      tombstones: manifest.tombstones
    });

    const localUsers = StorageService.getUsers();
    const localWhs = StorageService.getWarehouses();
    const localTombstones = StorageService.getTombstones();
    const localMetaDigest = computeMetaDigest(localUsers, localWhs, localTombstones);

    if (metaDirty || localMetaDigest !== manifest.metaDigest) {
      const metaRes = await fetchJson<{
        serverRevision: number;
        users: User[];
        warehouses: Warehouse[];
        tombstones: TombstoneMap;
      }>('/api/sync/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: CLIENT_ID,
          users: localUsers,
          warehouses: localWhs,
          tombstones: localTombstones
        })
      });
      StorageService.applyRemoteMeta({
        users: metaRes.users,
        warehouses: metaRes.warehouses,
        tombstones: metaRes.tombstones
      });
      metaDirty = false;
      lastKnownServerRev = Math.max(lastKnownServerRev, metaRes.serverRevision);
    }

    // Bước 2: Kéo về tất cả Phiếu Nhập còn thiếu hoặc thay đổi
    const localInbounds = StorageService.getInboundReceipts();
    const localInMap = new Map<string, InboundReceipt>();
    for (let i = 0; i < localInbounds.length; i++) {
      localInMap.set(normKey(localInbounds[i].receiptCode || localInbounds[i].id), localInbounds[i]);
    }

    const inboundCodesToPull: string[] = [];
    const serverInMap = new Map<string, ManifestReceiptEntry>();
    for (let i = 0; i < manifest.inboundManifest.length; i++) {
      const entry = manifest.inboundManifest[i];
      serverInMap.set(entry.code, entry);
      const localRcp = localInMap.get(entry.code);
      if (
        !localRcp ||
        localRcp.items.length < entry.itemCount ||
        computeInboundReceiptDigest(localRcp) !== entry.digest
      ) {
        inboundCodesToPull.push(entry.code);
      }
    }

    if (inboundCodesToPull.length > 0) {
      await pullMissingReceipts('inbound', inboundCodesToPull);
    }

    // Bước 3: Kéo về tất cả Phiếu Xuất còn thiếu hoặc thay đổi
    const localOutbounds = StorageService.getOutboundReceipts();
    const localOutMap = new Map<string, OutboundReceipt>();
    for (let i = 0; i < localOutbounds.length; i++) {
      localOutMap.set(normKey(localOutbounds[i].issueCode || localOutbounds[i].id), localOutbounds[i]);
    }

    const outboundCodesToPull: string[] = [];
    const serverOutMap = new Map<string, ManifestReceiptEntry>();
    for (let i = 0; i < manifest.outboundManifest.length; i++) {
      const entry = manifest.outboundManifest[i];
      serverOutMap.set(entry.code, entry);
      const localRcp = localOutMap.get(entry.code);
      if (
        !localRcp ||
        localRcp.items.length < entry.itemCount ||
        computeOutboundReceiptDigest(localRcp) !== entry.digest
      ) {
        outboundCodesToPull.push(entry.code);
      }
    }

    if (outboundCodesToPull.length > 0) {
      await pullMissingReceipts('outbound', outboundCodesToPull);
    }

    // Bước 4: Đẩy lên Server toàn bộ Phiếu Nhập của máy này mà Server chưa có đủ hoặc khác digest
    const refreshedInbounds = StorageService.getInboundReceipts();
    const inboundsToPush: InboundReceipt[] = [];
    for (let i = 0; i < refreshedInbounds.length; i++) {
      const rcp = refreshedInbounds[i];
      const code = normKey(rcp.receiptCode || rcp.id);
      const srv = serverInMap.get(code);
      if (!srv || rcp.items.length > srv.itemCount || computeInboundReceiptDigest(rcp) !== srv.digest) {
        inboundsToPush.push(rcp);
      }
    }
    if (inboundsToPush.length > 0) {
      await pushReceiptsChunked('inbound', inboundsToPush);
    }

    // Bước 5: Đẩy lên Server toàn bộ Phiếu Xuất của máy này mà Server chưa có đủ hoặc khác digest
    const refreshedOutbounds = StorageService.getOutboundReceipts();
    const outboundsToPush: OutboundReceipt[] = [];
    for (let i = 0; i < refreshedOutbounds.length; i++) {
      const rcp = refreshedOutbounds[i];
      const code = normKey(rcp.issueCode || rcp.id);
      const srv = serverOutMap.get(code);
      if (!srv || rcp.items.length > srv.itemCount || computeOutboundReceiptDigest(rcp) !== srv.digest) {
        outboundsToPush.push(rcp);
      }
    }
    if (outboundsToPush.length > 0) {
      await pushReceiptsChunked('outbound', outboundsToPush);
    }

    // Bước 6: Đồng bộ cộng gộp 100% Danh Mục Vật Tư bằng digest chính xác
    const prePullMatDigest = computeMaterialsDigest(StorageService.getMaterials());
    if (manifest.materialsCount > 0 && prePullMatDigest !== manifest.materialsDigest) {
      await pullAllMaterials();
    }

    const postPullMatDigest = computeMaterialsDigest(StorageService.getMaterials());
    if (materialsDirty || postPullMatDigest !== manifest.materialsDigest) {
      await pushAllMaterialsChunked();
    }

    lastKnownServerRev = Math.max(lastKnownServerRev, manifest.serverRevision);
    await StorageService.flush();
  } catch (err) {
    console.warn('Background sync skipped or deferred:', err);
  } finally {
    isReconciling = false;
    notifySyncState(false);

    if (pendingReconcile) {
      pendingReconcile = false;
      void reconcileInternal();
    }
  }
}

function schedulePush(delayMs = 150): void {
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    void reconcileInternal();
  }, delayMs);
}

function setupBroadcastChannel(): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' || authChannel) return;
  try {
    authChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    authChannel.onmessage = (ev) => {
      const data = ev.data;
      if (!data) return;
      if (data.type === 'auth:session_replaced') {
        const current = getStoredUnifiedSession();
        if (
          current &&
          normUserKey(current.session.userKey) === normUserKey(data.userKey) &&
          current.session.sessionToken !== data.activeSessionToken
        ) {
          triggerLocalKickOut({
            reason: 'replaced',
            username: current.user.username,
            fullName: current.user.fullName,
            deviceLabel: data.deviceLabel,
            loginAt: data.loginAt
          });
        }
      } else if (data.type === 'sync:local_changed') {
        void reconcileInternal();
      }
    };
  } catch {
    // ignore if BroadcastChannel unsupported
  }
}

function connectWebSocket(force = false): void {
  if (typeof window === 'undefined') return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (!force && Date.now() < nextWsAllowedAtMs) {
    return;
  }

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws-sync`;
    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.onopen = () => {
      wsFailCount = 0;
      nextWsAllowedAtMs = 0;
      sendWsAuthCheck();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'auth:session_replaced') {
          const current = getStoredUnifiedSession();
          if (
            current &&
            normUserKey(current.session.userKey) === normUserKey(msg.userKey) &&
            current.session.sessionToken !== msg.activeSessionToken
          ) {
            triggerLocalKickOut({
              reason: 'replaced',
              username: current.user.username,
              fullName: current.user.fullName,
              deviceLabel: msg.deviceLabel,
              loginAt: msg.loginAt
            });
          }
          return;
        }

        if (msg.type === 'auth:user_disabled') {
          const current = getStoredUnifiedSession();
          if (current && normUserKey(current.session.userKey) === normUserKey(msg.userKey)) {
            triggerLocalKickOut({ reason: 'disabled' });
          }
          return;
        }

        if (msg.type === 'auth:session_expired') {
          const current = getStoredUnifiedSession();
          if (current && normUserKey(current.session.userKey) === normUserKey(msg.userKey)) {
            triggerLocalKickOut({ reason: 'expired' });
          }
          return;
        }

        if (msg.type === 'sync:hello') {
          if (msg.activeSessions) {
            inspectManifestActiveSessions(msg.activeSessions);
          }
          void reconcileInternal();
          return;
        }

        if (msg.type === 'sync:updated') {
          if (msg.senderClientId && msg.senderClientId === CLIENT_ID) {
            return;
          }
          void reconcileInternal();
        }
      } catch {
        // ignore malformed message
      }
    };

    socket.onclose = () => {
      ws = null;
      wsFailCount++;
      // Giãn cách thông minh cho môi trường Serverless (Vercel) không mở cổng WebSocket
      const delayMs = wsFailCount <= 1 ? 3000 : wsFailCount === 2 ? 10000 : 45000;
      nextWsAllowedAtMs = Date.now() + delayMs;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connectWebSocket(true), delayMs);
    };

    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
    };
  } catch {
    wsFailCount++;
    const delayMs = wsFailCount <= 1 ? 4000 : 30000;
    nextWsAllowedAtMs = Date.now() + delayMs;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connectWebSocket(true), delayMs);
  }
}

export const SyncService = {
  start(): void {
    if (isStarted) return;
    isStarted = true;

    // Xóa sạch toàn bộ khóa phiên cũ để loại bỏ mọi phiên treo từ phiên bản trước
    purgeLegacySessionKeys();
    setupBroadcastChannel();

    StorageService.onLocalMutation((kind) => {
      if (kind === 'materials') {
        materialsDirty = true;
      } else if (kind === 'meta') {
        metaDirty = true;
      }
      schedulePush(150);
      try {
        authChannel?.postMessage({ type: 'sync:local_changed' });
      } catch {
        // ignore
      }
    });

    connectWebSocket();
    void verifySessionHeartbeat();
    void reconcileInternal();

    if (typeof window !== 'undefined') {
      const wakeCheck = () => {
        connectWebSocket();
        sendWsAuthCheck();
        void verifySessionHeartbeat();
        void reconcileInternal();
      };

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          wakeCheck();
        }
      });

      window.addEventListener('focus', wakeCheck);
      window.addEventListener('pageshow', wakeCheck);
      window.addEventListener('online', wakeCheck);
      window.addEventListener('storage', (ev) => {
        if (ev.key === STATIC_SESSIONS_STORAGE_KEY) {
          void verifySessionHeartbeat();
        }
      });

      // Kiểm tra tức thì khi người dùng chạm màn hình điện thoại hoặc di chuột/bấm phím (giãn cách 1.5s)
      const handleInteraction = () => {
        const now = Date.now();
        if (now - lastInteractionCheckMs < 1500) return;
        lastInteractionCheckMs = now;
        if (getStoredUnifiedSession()) {
          connectWebSocket();
          void verifySessionHeartbeat();
        }
      };
      window.addEventListener('pointerdown', handleInteraction, { passive: true });
      window.addEventListener('keydown', handleInteraction, { passive: true });

      // Nhịp tim chuyên biệt kiểm tra phiên 1 thiết bị mỗi 1.5 giây (chạy độc lập kể cả khi cửa sổ không active hoặc đang đồng bộ file lớn)
      sessionHeartbeatTimer = setInterval(() => {
        if (getStoredUnifiedSession()) {
          connectWebSocket();
          void verifySessionHeartbeat();
        }
      }, 1500);

      // Đồng bộ dữ liệu nền định kỳ mỗi 4 giây
      pollTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          void reconcileInternal();
        }
      }, 4000);
    }
  },

  async initialSync(timeoutMs = 4500): Promise<void> {
    await Promise.race([
      Promise.all([verifySessionHeartbeat(), reconcileInternal()]),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  },

  async syncNow(): Promise<void> {
    await Promise.all([verifySessionHeartbeat(), reconcileInternal()]);
  },

  getUnifiedSession(): UnifiedAuthSession | null {
    return getStoredUnifiedSession();
  },

  updateUnifiedSessionUser(updatedUser: User): void {
    const current = getStoredUnifiedSession();
    if (!current) return;
    if (
      current.user.id === updatedUser.id ||
      normUserKey(current.user.username) === normUserKey(updatedUser.username)
    ) {
      saveStoredUnifiedSession({
        user: updatedUser,
        session: current.session
      });
    }
  },

  async verifyCurrentSession(): Promise<void> {
    await verifySessionHeartbeat();
  },

  getPersistedKickNotice(): SessionInvalidationInfo | null {
    return readPersistedKickNotice();
  },

  clearPersistedKickNotice(): void {
    clearPersistedKickNotice();
  },

  async loginWithServer(
    username: string,
    password: string
  ): Promise<{ success: boolean; message: string; user?: User; replacedSession?: ActiveUserSession }> {
    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();
    const localUsers = StorageService.getUsers();

    const attemptLogin = () =>
      fetchJson<{
        success: boolean;
        message: string;
        user?: User;
        session?: ActiveUserSession;
        replacedSession?: ActiveUserSession;
        users?: User[];
      }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          deviceId,
          deviceLabel,
          localUsers
        })
      });

    try {
      let res;
      try {
        res = await attemptLogin();
      } catch (firstErr) {
        if (firstErr instanceof ApiRouteMissingError) {
          throw firstErr;
        }
        // Thử lại 1 lần sau 450ms nếu mạng di động vừa chuyển vùng / thức dậy
        await new Promise((r) => setTimeout(r, 450));
        res = await attemptLogin();
      }

      if (!res.success || !res.user || !res.session) {
        return {
          success: false,
          message: res.message || 'Đăng nhập không thành công.'
        };
      }

      if (Array.isArray(res.users) && res.users.length > 0) {
        StorageService.applyRemoteMeta({ users: res.users });
      }

      pendingInvalidation = null;
      clearPersistedKickNotice();
      saveStoredUnifiedSession({
        user: res.user,
        session: res.session
      });

      try {
        authChannel?.postMessage({
          type: 'auth:session_replaced',
          userKey: res.session.userKey,
          activeSessionToken: res.session.sessionToken,
          deviceLabel: res.session.deviceLabel,
          loginAt: res.session.loginAt
        });
      } catch {
        // ignore
      }

      connectWebSocket();
      sendWsAuthCheck();
      void reconcileInternal();

      return {
        success: true,
        message: res.message,
        user: res.user,
        replacedSession: res.replacedSession
      };
    } catch (err) {
      // Dự phòng an toàn chỉ khi bản build tĩnh thuần chưa triển khai nhánh /api (404 / HTML)
      if (err instanceof ApiRouteMissingError) {
        const inputKey = normUserKey(username);
        const matched = localUsers.find(
          (u) => normUserKey(u.username) === inputKey || normUserKey(u.fullName) === inputKey
        );
        if (!matched) {
          return {
            success: false,
            message: `Tài khoản "${username}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại!`
          };
        }
        if (!matched.isActive) {
          return {
            success: false,
            message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt. Vui lòng liên hệ Admin.'
          };
        }
        if ((matched.password || '') !== password) {
          return {
            success: false,
            message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
          };
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const userKey = normUserKey(matched.username);
        const staticMap = getStaticSessionsMap();
        const prevStatic = staticMap[userKey];

        const staticSession: ActiveUserSession = {
          userId: matched.id,
          username: matched.username,
          userKey,
          sessionToken: `static-${nowMs}-${Math.random().toString(36).slice(2, 10)}`,
          deviceId,
          deviceLabel,
          loginAt: nowIso,
          lastSeenAt: nowMs
        };

        saveStaticSessionEntry(userKey, staticSession);
        pendingInvalidation = null;
        clearPersistedKickNotice();
        saveStoredUnifiedSession({
          user: matched,
          session: staticSession
        });

        try {
          authChannel?.postMessage({
            type: 'auth:session_replaced',
            userKey,
            activeSessionToken: staticSession.sessionToken,
            deviceLabel,
            loginAt: nowIso
          });
        } catch {
          // ignore
        }

        return {
          success: true,
          message: 'Đăng nhập thành công!',
          user: matched,
          replacedSession: prevStatic
        };
      }

      return {
        success: false,
        message:
          'Không thể kết nối máy chủ xác thực phiên thiết bị. Vui lòng kiểm tra kết nối mạng và thử lại.'
      };
    }
  },

  async logoutFromServer(): Promise<void> {
    const current = getStoredUnifiedSession();
    clearStoredUnifiedSession();
    if (!current) return;

    if (current.session.sessionToken.startsWith('static-')) {
      const staticMap = getStaticSessionsMap();
      if (staticMap[current.session.userKey]?.sessionToken === current.session.sessionToken) {
        saveStaticSessionEntry(current.session.userKey, null);
      }
      return;
    }

    try {
      await fetchJson('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userKey: current.session.userKey,
          sessionToken: current.session.sessionToken
        })
      });
    } catch {
      // ignore network error on logout
    }
  },

  onSessionInvalidated(listener: (info: SessionInvalidationInfo) => void): () => void {
    sessionInvalidatedListeners.add(listener);
    if (pendingInvalidation) {
      const buffered = pendingInvalidation;
      pendingInvalidation = null;
      queueMicrotask(() => {
        try {
          listener(buffered);
        } catch {
          // ignore
        }
      });
    }
    return () => {
      sessionInvalidatedListeners.delete(listener);
    };
  },

  subscribeSyncState(listener: (syncing: boolean) => void): () => void {
    syncStateListeners.add(listener);
    return () => {
      syncStateListeners.delete(listener);
    };
  },

  stop(): void {
    if (pollTimer) clearInterval(pollTimer);
    if (sessionHeartbeatTimer) clearInterval(sessionHeartbeatTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
    isStarted = false;
  }
};
