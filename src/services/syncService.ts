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
  reason: 'replaced' | 'disabled' | 'expired' | 'force_logout';
  username?: string;
  fullName?: string;
  deviceLabel?: string;
  loginAt?: string;
}

export interface UnifiedAuthSession {
  user: User;
  session: ActiveUserSession;
}

export interface LoginServerResult {
  success: boolean;
  message: string;
  conflict?: boolean;
  activeSession?: ActiveUserSession;
  user?: User;
  replacedSession?: ActiveUserSession;
}

const CLIENT_ID = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DEVICE_ID_STORAGE_KEY = 'vtp_device_id_v1';
const UNIFIED_SESSION_STORAGE_KEY = 'vtp_auth_session_v5';
const KICK_NOTICE_STORAGE_KEY = 'vtp_session_kick_notice_v1';
const STATIC_SESSIONS_STORAGE_KEY = 'vtp_static_active_sessions_v1';
const STATIC_TTL_MS = 90_000;
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
let authTransitionCount = 0;
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

function getClientSessionIssuedAtMs(sess?: ActiveUserSession | null): number {
  if (!sess) return 0;
  if (Number(sess.issuedAtMs) > 0) return Number(sess.issuedAtMs);
  const token = String(sess.sessionToken || '');
  if (token.startsWith('static-')) {
    const parts = token.split('-');
    const ts = Number(parts[1]);
    if (Number.isFinite(ts) && ts > 0) return ts;
  } else {
    const parts = token.split('.');
    if (parts.length >= 3) {
      const ts = Number(parts[1]);
      if (Number.isFinite(ts) && ts > 0) return ts;
    }
  }
  const parsedLogin = sess.loginAt ? Date.parse(sess.loginAt) : 0;
  return Number.isFinite(parsedLogin) && parsedLogin > 0 ? parsedLogin : 0;
}

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
  let sentSessionToken = '';
  if (url.startsWith('/api/sync')) {
    const current = getStoredUnifiedSession();
    if (current && !current.session.sessionToken.startsWith('static-')) {
      sentSessionToken = current.session.sessionToken;
      headers.set('x-auth-user-key', encodeURIComponent(current.session.userKey));
      headers.set('x-auth-session-token', sentSessionToken);
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
  const checkedToken = res.headers.get('X-Auth-Token-Checked') || sentSessionToken;
  const latestStored = getStoredUnifiedSession();

  // Chỉ đăng xuất nếu header lỗi phiên thuộc đúng phiên hiện đang lưu (chống triệt để request cũ về trễ đá nhầm phiên mới!)
  if (
    invalidatedReason &&
    authTransitionCount === 0 &&
    sentSessionToken &&
    latestStored &&
    latestStored.session.sessionToken === checkedToken
  ) {
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
    } else if (invalidatedReason === 'force_logout') {
      triggerLocalKickOut({
        reason: 'force_logout',
        deviceLabel: replacedBy?.deviceLabel,
        loginAt: replacedBy?.loginAt
      });
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
        sessionToken: current.session.sessionToken,
        deviceId: current.session.deviceId,
        deviceLabel: current.session.deviceLabel,
        loginAt: current.session.loginAt
      })
    );
  } catch {
    // ignore
  }
}

async function verifySessionHeartbeat(): Promise<void> {
  if (isVerifyingSession || authTransitionCount > 0) return;
  const current = getStoredUnifiedSession();
  if (!current) return;

  isVerifyingSession = true;
  try {
    const mySession = current.session;

    if (mySession.sessionToken.startsWith('static-')) {
      const staticMap = getStaticSessionsMap();
      const activeStatic = staticMap[mySession.userKey];
      if (!activeStatic) {
        triggerLocalKickOut({ reason: 'force_logout' });
        return;
      }
      if (activeStatic.sessionToken !== mySession.sessionToken) {
        if (getClientSessionIssuedAtMs(activeStatic) >= getClientSessionIssuedAtMs(mySession)) {
          triggerLocalKickOut({
            reason: 'replaced',
            deviceLabel: activeStatic.deviceLabel,
            loginAt: activeStatic.loginAt
          });
        }
        return;
      }
      saveStaticSessionEntry(mySession.userKey, {
        ...activeStatic,
        lastSeenAt: Date.now()
      });
      return;
    }

    const res = await fetchJson<{
      valid: boolean;
      reason?: 'replaced' | 'disabled' | 'expired' | 'force_logout' | 'missing';
      session?: ActiveUserSession;
      replacedBy?: ActiveUserSession;
      forceLogoutBy?: { deviceLabel?: string; at?: string };
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
    if (
      authTransitionCount > 0 ||
      !latestLocal ||
      latestLocal.session.sessionToken !== mySession.sessionToken
    ) {
      return;
    }

    if (!res.valid) {
      if (res.reason === 'disabled') {
        triggerLocalKickOut({ reason: 'disabled' });
      } else if (res.reason === 'force_logout') {
        triggerLocalKickOut({
          reason: 'force_logout',
          deviceLabel: res.forceLogoutBy?.deviceLabel,
          loginAt: res.forceLogoutBy?.at
        });
      } else if (res.reason === 'replaced') {
        triggerLocalKickOut({
          reason: 'replaced',
          deviceLabel: res.replacedBy?.deviceLabel,
          loginAt: res.replacedBy?.loginAt
        });
      } else {
        triggerLocalKickOut({ reason: 'expired' });
      }
      return;
    }

    if (res.session && res.session.issuedAtMs && !latestLocal.session.issuedAtMs) {
      saveStoredUnifiedSession({
        user: latestLocal.user,
        session: {
          ...latestLocal.session,
          issuedAtMs: res.session.issuedAtMs
        }
      });
    }
  } catch {
    // Tạm thời bỏ qua lỗi mạng chập chờn, sẽ kiểm tra lại ở nhịp kế tiếp
  } finally {
    isVerifyingSession = false;
  }
}

function inspectManifestActiveSessions(
  activeSessions?: Record<string, ActiveUserSession>,
  manifestUsers?: User[]
): boolean {
  if (authTransitionCount > 0) return true;
  const current = getStoredUnifiedSession();
  if (!current) return true;

  if (current.session.sessionToken.startsWith('static-')) {
    triggerLocalKickOut({ reason: 'expired' });
    return false;
  }

  const mySession = current.session;
  const myIssuedAt = getClientSessionIssuedAtMs(mySession);

  if (Array.isArray(manifestUsers)) {
    const matchedUser = manifestUsers.find(
      (u) => normUserKey(u.username) === normUserKey(mySession.userKey) || u.id === mySession.userId
    );
    if (matchedUser && !matchedUser.isActive) {
      triggerLocalKickOut({ reason: 'disabled' });
      return false;
    }
    const revokedAt = Number(matchedUser?.sessionRevokedAt) || 0;
    if (revokedAt > 0 && myIssuedAt > 0 && myIssuedAt <= revokedAt) {
      const remote = activeSessions?.[mySession.userKey];
      if (
        remote &&
        remote.sessionToken !== mySession.sessionToken &&
        getClientSessionIssuedAtMs(remote) > myIssuedAt
      ) {
        triggerLocalKickOut({
          reason: 'replaced',
          deviceLabel: remote.deviceLabel,
          loginAt: remote.loginAt
        });
      } else {
        triggerLocalKickOut({ reason: 'force_logout' });
      }
      return false;
    }
  }

  if (!activeSessions) return true;
  const remote = activeSessions[mySession.userKey];
  if (!remote || remote.sessionToken === mySession.sessionToken) {
    return true;
  }

  const remoteIssuedAt = getClientSessionIssuedAtMs(remote);
  // Chỉ đăng xuất nếu phiên trên Server thực sự MỚI HƠN phiên hiện tại; nếu cũ hơn (do Lambda ấm khác trả về), gọi verify để nâng cấp Lambda đó!
  if (myIssuedAt > 0 && remoteIssuedAt > 0 && remoteIssuedAt <= myIssuedAt) {
    void verifySessionHeartbeat();
    return true;
  }

  triggerLocalKickOut({
    reason: 'replaced',
    deviceLabel: remote.deviceLabel,
    loginAt: remote.loginAt
  });
  return false;
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
    const tokenBeforeManifest = getStoredUnifiedSession()?.session.sessionToken || '';
    const manifest = await fetchJson<ServerManifest>(`/api/sync/manifest?t=${Date.now()}`);

    // Bước 0: Chỉ kiểm tra phiên từ manifest nếu phiên đăng nhập không bị thay đổi trong lúc chờ mạng
    if (
      authTransitionCount === 0 &&
      (getStoredUnifiedSession()?.session.sessionToken || '') === tokenBeforeManifest
    ) {
      inspectManifestActiveSessions(manifest.activeSessions, manifest.users);
    }

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
          const myIssued = getClientSessionIssuedAtMs(current.session);
          const remoteIssued = Number(data.issuedAtMs) || 0;
          if (!myIssued || !remoteIssued || remoteIssued >= myIssued) {
            triggerLocalKickOut({
              reason: 'replaced',
              username: current.user.username,
              fullName: current.user.fullName,
              deviceLabel: data.deviceLabel,
              loginAt: data.loginAt
            });
          }
        }
      } else if (data.type === 'auth:session_force_logout') {
        const current = getStoredUnifiedSession();
        if (
          current &&
          normUserKey(current.session.userKey) === normUserKey(data.userKey) &&
          (!data.exceptSessionToken || current.session.sessionToken !== data.exceptSessionToken)
        ) {
          const myIssued = getClientSessionIssuedAtMs(current.session);
          const revokedBefore = Number(data.revokedBeforeMs) || 0;
          if (!revokedBefore || !myIssued || myIssued <= revokedBefore) {
            triggerLocalKickOut({
              reason: 'force_logout',
              username: current.user.username,
              fullName: current.user.fullName,
              deviceLabel: data.deviceLabel,
              loginAt: data.at
            });
          }
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
            const myIssued = getClientSessionIssuedAtMs(current.session);
            const remoteIssued =
              Number(msg.issuedAtMs) || (msg.loginAt ? Date.parse(msg.loginAt) : 0);
            if (!myIssued || !remoteIssued || remoteIssued >= myIssued) {
              triggerLocalKickOut({
                reason: 'replaced',
                username: current.user.username,
                fullName: current.user.fullName,
                deviceLabel: msg.deviceLabel,
                loginAt: msg.loginAt
              });
            }
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

        if (msg.type === 'auth:session_force_logout') {
          const current = getStoredUnifiedSession();
          if (!current || normUserKey(current.session.userKey) !== normUserKey(msg.userKey)) {
            return;
          }
          if (msg.exceptSessionToken && current.session.sessionToken === msg.exceptSessionToken) {
            return;
          }
          if (msg.expiredSessionToken && current.session.sessionToken !== msg.expiredSessionToken) {
            return;
          }
          const myIssued = getClientSessionIssuedAtMs(current.session);
          const revokedBefore = Number(msg.revokedBeforeMs) || 0;
          if (!revokedBefore || !myIssued || myIssued <= revokedBefore) {
            triggerLocalKickOut({
              reason: 'force_logout',
              username: current.user.username,
              fullName: current.user.fullName,
              deviceLabel: msg.deviceLabel,
              loginAt: msg.at
            });
          }
          return;
        }

        if (msg.type === 'auth:session_expired') {
          const current = getStoredUnifiedSession();
          if (!current || normUserKey(current.session.userKey) !== normUserKey(msg.userKey)) {
            return;
          }
          // Chỉ thoát nếu đúng mã phiên bị hết hạn, tuyệt đối không đá nhầm phiên mới!
          if (msg.expiredSessionToken && current.session.sessionToken !== msg.expiredSessionToken) {
            return;
          }
          triggerLocalKickOut({ reason: 'expired' });
          return;
        }

        if (msg.type === 'sync:hello') {
          if (msg.activeSessions && authTransitionCount === 0) {
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

      // Nhịp tim chuyên biệt kiểm tra phiên 1 thiết bị mỗi 2 giây
      sessionHeartbeatTimer = setInterval(() => {
        if (getStoredUnifiedSession() && authTransitionCount === 0) {
          connectWebSocket();
          void verifySessionHeartbeat();
        }
      }, 2000);

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
    password: string,
    options?: { forceLogoutOtherDevice?: boolean }
  ): Promise<LoginServerResult> {
    authTransitionCount++;
    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();
    const localUsers = StorageService.getUsers();
    const forceLogoutOtherDevice = Boolean(options?.forceLogoutOtherDevice);

    const attemptLogin = () =>
      fetchJson<{
        success: boolean;
        conflict?: boolean;
        code?: string;
        activeSession?: ActiveUserSession;
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
          localUsers,
          forceLogoutOtherDevice
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
        await new Promise((r) => setTimeout(r, 450));
        res = await attemptLogin();
      }

      if (!res.success || !res.user || !res.session) {
        return {
          success: false,
          conflict: Boolean(res.conflict),
          activeSession: res.activeSession,
          message: res.message || 'Đăng nhập không thành công.'
        };
      }

      pendingInvalidation = null;
      clearPersistedKickNotice();
      saveStoredUnifiedSession({
        user: res.user,
        session: res.session
      });

      if (Array.isArray(res.users) && res.users.length > 0) {
        StorageService.applyRemoteMeta({ users: res.users });
      }

      try {
        authChannel?.postMessage({
          type: 'auth:session_replaced',
          userKey: res.session.userKey,
          activeSessionToken: res.session.sessionToken,
          issuedAtMs: res.session.issuedAtMs,
          deviceLabel: res.session.deviceLabel,
          loginAt: res.session.loginAt
        });
      } catch {
        // ignore
      }

      connectWebSocket();
      sendWsAuthCheck();
      queueMicrotask(() => {
        void reconcileInternal();
      });

      return {
        success: true,
        message: res.message,
        user: res.user,
        replacedSession: res.replacedSession
      };
    } catch (err) {
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

        if (
          prevStatic &&
          prevStatic.deviceId !== deviceId &&
          nowMs - (prevStatic.lastSeenAt || 0) <= STATIC_TTL_MS &&
          !forceLogoutOtherDevice
        ) {
          return {
            success: false,
            conflict: true,
            activeSession: prevStatic,
            message: `Tài khoản "${matched.username}" hiện đang đăng nhập trên ${prevStatic.deviceLabel || 'thiết bị khác'}. Vui lòng nhấn "Yêu cầu đăng xuất trên thiết bị kia" để tiếp tục.`
          };
        }

        const staticSession: ActiveUserSession = {
          userId: matched.id,
          username: matched.username,
          userKey,
          sessionToken: `static-${nowMs}-${Math.random().toString(36).slice(2, 10)}`,
          issuedAtMs: nowMs,
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
            issuedAtMs: nowMs,
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
    } finally {
      authTransitionCount = Math.max(0, authTransitionCount - 1);
    }
  },

  async requestLogoutOtherDevice(
    username: string,
    password: string
  ): Promise<{ success: boolean; message: string }> {
    authTransitionCount++;
    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();
    const localUsers = StorageService.getUsers();

    try {
      const res = await fetchJson<{
        success: boolean;
        message: string;
        users?: User[];
      }>('/api/auth/force-logout', {
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

      if (!res.success) {
        return {
          success: false,
          message: res.message || 'Không thể gửi yêu cầu đăng xuất thiết bị kia.'
        };
      }

      if (Array.isArray(res.users) && res.users.length > 0) {
        StorageService.applyRemoteMeta({ users: res.users });
      }

      const targetKey = normUserKey(username);
      const current = getStoredUnifiedSession();
      if (current && normUserKey(current.session.userKey) === targetKey) {
        clearStoredUnifiedSession();
      }

      try {
        authChannel?.postMessage({
          type: 'auth:session_force_logout',
          userKey: targetKey,
          deviceLabel,
          at: new Date().toISOString()
        });
      } catch {
        // ignore
      }

      queueMicrotask(() => {
        void reconcileInternal();
      });

      return {
        success: true,
        message:
          res.message ||
          'Đã yêu cầu đăng xuất trên thiết bị kia thành công! Bạn có thể đăng nhập ngay bây giờ.'
      };
    } catch (err) {
      if (err instanceof ApiRouteMissingError) {
        const inputKey = normUserKey(username);
        const matched = localUsers.find(
          (u) => normUserKey(u.username) === inputKey || normUserKey(u.fullName) === inputKey
        );
        if (!matched) {
          return {
            success: false,
            message: `Tài khoản "${username}" không tồn tại trong hệ thống.`
          };
        }
        if ((matched.password || '') !== password) {
          return {
            success: false,
            message: 'Mật khẩu xác thực không chính xác.'
          };
        }
        const userKey = normUserKey(matched.username);
        saveStaticSessionEntry(userKey, null);
        try {
          authChannel?.postMessage({
            type: 'auth:session_force_logout',
            userKey,
            deviceLabel,
            at: new Date().toISOString()
          });
        } catch {
          // ignore
        }
        return {
          success: true,
          message: 'Đã đăng xuất phiên trên thiết bị kia thành công! Bạn có thể đăng nhập ngay.'
        };
      }
      return {
        success: false,
        message: 'Không thể kết nối máy chủ để gửi yêu cầu đăng xuất thiết bị kia. Vui lòng thử lại.'
      };
    } finally {
      authTransitionCount = Math.max(0, authTransitionCount - 1);
    }
  },

  async forceLogoutOtherDevicesKeepCurrent(): Promise<{ success: boolean; message: string }> {
    const current = getStoredUnifiedSession();
    if (!current) {
      return { success: false, message: 'Chưa đăng nhập tài khoản.' };
    }

    authTransitionCount++;
    try {
      if (current.session.sessionToken.startsWith('static-')) {
        const nowMs = Date.now();
        const refreshed: ActiveUserSession = {
          ...current.session,
          sessionToken: `static-${nowMs}-${Math.random().toString(36).slice(2, 10)}`,
          issuedAtMs: nowMs,
          lastSeenAt: nowMs
        };
        saveStaticSessionEntry(current.session.userKey, refreshed);
        saveStoredUnifiedSession({
          user: current.user,
          session: refreshed
        });
        try {
          authChannel?.postMessage({
            type: 'auth:session_force_logout',
            userKey: current.session.userKey,
            exceptSessionToken: refreshed.sessionToken,
            deviceLabel: current.session.deviceLabel,
            at: new Date(nowMs).toISOString()
          });
        } catch {
          // ignore
        }
        return {
          success: true,
          message: 'Đã yêu cầu đăng xuất trên mọi thiết bị khác thành công!'
        };
      }

      const res = await fetchJson<{
        success: boolean;
        message: string;
        user?: User;
        session?: ActiveUserSession;
        users?: User[];
      }>('/api/auth/force-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepCurrentSession: true,
          userKey: current.session.userKey,
          username: current.user.username,
          userId: current.user.id,
          sessionToken: current.session.sessionToken,
          deviceId: current.session.deviceId,
          deviceLabel: current.session.deviceLabel
        })
      });

      if (!res.success || !res.session) {
        return {
          success: false,
          message: res.message || 'Không thể yêu cầu đăng xuất thiết bị kia.'
        };
      }

      saveStoredUnifiedSession({
        user: res.user || current.user,
        session: res.session
      });

      if (Array.isArray(res.users) && res.users.length > 0) {
        StorageService.applyRemoteMeta({ users: res.users });
      }

      try {
        authChannel?.postMessage({
          type: 'auth:session_force_logout',
          userKey: res.session.userKey,
          exceptSessionToken: res.session.sessionToken,
          deviceLabel: res.session.deviceLabel,
          at: new Date().toISOString()
        });
      } catch {
        // ignore
      }

      sendWsAuthCheck();
      queueMicrotask(() => {
        void reconcileInternal();
      });

      return {
        success: true,
        message: res.message || 'Đã gửi yêu cầu đăng xuất thành công tới mọi thiết bị khác!'
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối máy chủ để gửi yêu cầu đăng xuất thiết bị kia.'
      };
    } finally {
      authTransitionCount = Math.max(0, authTransitionCount - 1);
    }
  },

  async logoutFromServer(): Promise<void> {
    const current = getStoredUnifiedSession();
    clearStoredUnifiedSession();
    if (!current) return;

    authTransitionCount++;
    try {
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
            sessionToken: current.session.sessionToken,
            deviceId: current.session.deviceId
          })
        });
      } catch {
        // ignore network error on logout
      }
    } finally {
      authTransitionCount = Math.max(0, authTransitionCount - 1);
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
