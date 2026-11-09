import { StorageService } from './storage';
import { FirestoreSyncService, type CloudSyncSnapshotState } from './firestoreSync';
import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  OutboundReceipt,
  TombstoneMap,
  ActiveUserSession,
  OsdReceipt
} from '../types/inventory';
import {
  normKey,
  normUserKey,
  resolveGoogleUserRecord,
  findMatchingUser,
  isPasswordMatch,
  isSessionHeartbeatFresh,
  computeMetaDigest,
  computeMaterialsDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  canonicalUserSessionKey
} from '../utils/additiveMerge';
import {
  compareVersionVectors,
  mergeVersionVectors,
  incrementVersionVector,
  resolveConcurrentOsd,
  type VersionVector,
  type VectorComparison
} from '../utils/versionVector';

export {
  compareVersionVectors,
  mergeVersionVectors,
  incrementVersionVector,
  resolveConcurrentOsd,
  type VersionVector,
  type VectorComparison
};

interface ManifestReceiptEntry {
  code: string;
  receiptCode?: string;
  issueCode?: string;
  id: string;
  itemCount: number;
  updatedAt: number;
  itemsReplacedAt?: number;
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
  osd?: OsdReceipt[];
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
  cloudConnectedOnly?: boolean;
  needsCloudConnect?: boolean;
  activeSession?: ActiveUserSession;
  user?: User;
  replacedSession?: ActiveUserSession;
}

export interface SyncResult {
  success: boolean;
  message: string;
  isOffline?: boolean;
  cloudSynced?: boolean;
  localSynced?: boolean;
  osdCount?: number;
  error?: string;
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
let localReceiptsDirty = false;
let hasCompletedInitialLocalSync = false;
let lastKnownServerRev = 0;
let lastPulledMaterialsRev = 0;
let lastInteractionCheckMs = 0;
let wsFailCount = 0;
let nextWsAllowedAtMs = 0;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sessionHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let authChannel: BroadcastChannel | null = null;
let lastKnownOsdRev = 0;

// Lưu thông báo đá phiên nếu xảy ra trong lúc Bootstrap trước khi AuthProvider kịp mount
let pendingInvalidation: SessionInvalidationInfo | null = null;

const syncStateListeners = new Set<(syncing: boolean) => void>();
const sessionInvalidatedListeners = new Set<(info: SessionInvalidationInfo) => void>();
const networkStatusListeners = new Set<(online: boolean) => void>();
const osdUpdateListeners = new Set<(osdList: OsdReceipt[]) => void>();
let cachedNetworkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

function notifyOsdListeners(osdList?: OsdReceipt[]): void {
  const current = osdList || StorageService.getOsdReceipts();
  for (const listener of osdUpdateListeners) {
    try {
      listener(current);
    } catch (err) {
      console.warn('OSD update listener error:', err);
    }
  }
}

function updateNetworkStatus(online: boolean): void {
  if (cachedNetworkOnline !== online) {
    cachedNetworkOnline = online;
    for (const listener of networkStatusListeners) {
      try {
        listener(online);
      } catch (err) {
        console.warn('Network status listener error:', err);
      }
    }
  }
}

function getClientSessionIssuedAtMs(sess?: ActiveUserSession | null): number {
  if (!sess) return 0;
  if (Number(sess.issuedAtMs) > 0) return Number(sess.issuedAtMs);
  const token = String(sess.sessionToken || '');
  if (token.startsWith('static-')) {
    const parts = token.split('-');
    const ts = Number(parts[1]);
    if (Number.isFinite(ts) && ts > 0) return ts;
  } else if (token.startsWith('cloud.')) {
    const parts = token.split('.');
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

let memoryDeviceId: string | null = null;
let memoryUnifiedSession: UnifiedAuthSession | null = null;
let memoryKickNotice: SessionInvalidationInfo | null = null;
let memoryStaticSessions: Record<string, ActiveUserSession> = {};

const revokedLocalTokens = new Set<string>();
let inFlightLogoutPromise: Promise<void> | null = null;
let authAttemptEpoch = 0;

function rememberRevokedLocalToken(token?: string | null): void {
  const clean = String(token || '').trim();
  if (!clean) return;
  if (revokedLocalTokens.size > 500) {
    const oldest = revokedLocalTokens.values().next().value;
    if (oldest) revokedLocalTokens.delete(oldest);
  }
  revokedLocalTokens.add(clean);
  FirestoreSyncService.markTokenRevoked(clean);
}

async function awaitPendingLogout(timeoutMs = 1800): Promise<void> {
  if (!inFlightLogoutPromise) return;
  await Promise.race([
    inFlightLogoutPromise.catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

const APP_AUTH_COOKIE_PATTERN = /^(vtp|auth|session|token|login|user|g_state|g_csrf|firebase)/i;

function clearBrowserAuthCookiesAndArtifacts(userKeyToClear?: string): void {
  pendingInvalidation = null;
  memoryKickNotice = null;
  memoryUnifiedSession = null;

  if (typeof document !== 'undefined') {
    try {
      const rawCookies = document.cookie || '';
      const cookieNames = rawCookies
        .split(';')
        .map((part) => part.split('=')[0]?.trim() || '')
        .filter((name) => Boolean(name) && APP_AUTH_COOKIE_PATTERN.test(name));

      if (cookieNames.length > 0) {
        const paths = new Set<string>(['/']);
        if (typeof window !== 'undefined' && window.location?.pathname) {
          const segments = window.location.pathname.split('/').filter(Boolean);
          let acc = '';
          for (const seg of segments) {
            acc += `/${seg}`;
            paths.add(acc);
          }
        }
        const expired = 'Thu, 01 Jan 1970 00:00:00 GMT';
        const attrVariants = [
          '',
          '; SameSite=Lax',
          '; SameSite=None; Secure',
          '; SameSite=None; Secure; Partitioned'
        ];
        for (const name of cookieNames) {
          for (const p of paths) {
            for (const attr of attrVariants) {
              try {
                document.cookie = `${name}=; expires=${expired}; Max-Age=0; path=${p}${attr}`;
              } catch {
                // ignore cookie attribute restriction
              }
            }
          }
        }
      }
    } catch {
      // ignore document.cookie restriction in strict sandbox
    }
  }

  if (typeof window !== 'undefined') {
    const keysToPurge = [
      UNIFIED_SESSION_STORAGE_KEY,
      KICK_NOTICE_STORAGE_KEY,
      ...LEGACY_SESSION_KEYS
    ];
    for (const k of keysToPurge) {
      try {
        sessionStorage.removeItem(k);
      } catch {
        // ignore
      }
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }

    try {
      const map = getStaticSessionsMap();
      let mutated = false;
      const nowMs = Date.now();
      const targetNorm = userKeyToClear ? normUserKey(userKeyToClear) : '';
      for (const [k, sess] of Object.entries(map)) {
        if (
          (targetNorm && normUserKey(k) === targetNorm) ||
          !sess ||
          revokedLocalTokens.has(sess.sessionToken) ||
          !isSessionHeartbeatFresh(nowMs, sess.lastSeenAt, STATIC_TTL_MS)
        ) {
          delete map[k];
          mutated = true;
        }
      }
      if (mutated) {
        memoryStaticSessions = map;
        localStorage.setItem(STATIC_SESSIONS_STORAGE_KEY, JSON.stringify(map));
      }
    } catch {
      // ignore
    }
  }
}

export function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  let tabId: string | null = null;
  try {
    tabId = sessionStorage.getItem('__app_tab_instance_id__');
  } catch {
    // ignore
  }
  if (!tabId) {
    tabId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `tab-${crypto.randomUUID().slice(0, 8)}`
        : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      sessionStorage.setItem('__app_tab_instance_id__', tabId);
    } catch {
      // ignore
    }
  }

  let hardwareId: string | null = null;
  try {
    hardwareId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (!hardwareId) {
    hardwareId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `dev-${crypto.randomUUID().slice(0, 12)}`
        : `dev-${Date.now().toString(36)}`;
    try {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, hardwareId);
    } catch {
      // ignore
    }
  }

  const combined = `${hardwareId}.${tabId}`;
  memoryDeviceId = combined;
  return combined;
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

function isValidUnifiedSession(parsed: UnifiedAuthSession | null | undefined): parsed is UnifiedAuthSession {
  return Boolean(
    parsed &&
      parsed.user &&
      parsed.user.id &&
      parsed.session &&
      parsed.session.userKey &&
      parsed.session.sessionToken &&
      !parsed.session.sessionToken.startsWith('offline-')
  );
}

function getStoredUnifiedSession(): UnifiedAuthSession | null {
  try {
    const raw = sessionStorage.getItem(UNIFIED_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UnifiedAuthSession;
      if (isValidUnifiedSession(parsed)) {
        memoryUnifiedSession = parsed;
        return parsed;
      }
      sessionStorage.removeItem(UNIFIED_SESSION_STORAGE_KEY);
    }
  } catch {
    // Trình duyệt Chrome chặn sessionStorage trong iframe / chế độ nghiêm ngặt -> dùng bộ nhớ RAM an toàn
  }
  return isValidUnifiedSession(memoryUnifiedSession) ? memoryUnifiedSession : null;
}

function saveStoredUnifiedSession(unified: UnifiedAuthSession): void {
  memoryUnifiedSession = unified;
  purgeLegacySessionKeys();
  try {
    sessionStorage.setItem(UNIFIED_SESSION_STORAGE_KEY, JSON.stringify(unified));
  } catch {
    // ignore when Web Storage is restricted by Chrome privacy settings
  }
}

function clearStoredUnifiedSession(): void {
  memoryUnifiedSession = null;
  purgeLegacySessionKeys();
  try {
    sessionStorage.removeItem(UNIFIED_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function savePersistedKickNotice(info: SessionInvalidationInfo): void {
  memoryKickNotice = info;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KICK_NOTICE_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // ignore
  }
}

function readPersistedKickNotice(): SessionInvalidationInfo | null {
  if (typeof window === 'undefined') return memoryKickNotice;
  try {
    const raw = sessionStorage.getItem(KICK_NOTICE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionInvalidationInfo;
      if (parsed && parsed.reason) {
        memoryKickNotice = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return memoryKickNotice;
}

function clearPersistedKickNotice(): void {
  memoryKickNotice = null;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KICK_NOTICE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function triggerLocalKickOut(info: SessionInvalidationInfo): void {
  const current = getStoredUnifiedSession();
  if (current?.session.sessionToken) {
    rememberRevokedLocalToken(current.session.sessionToken);
  }
  const enriched: SessionInvalidationInfo = {
    ...info,
    username: info.username || current?.user.username,
    fullName: info.fullName || current?.user.fullName
  };
  FirestoreSyncService.watchActiveSession(null);
  clearStoredUnifiedSession();
  void FirestoreSyncService.disconnectGoogleAccount().catch(() => {});
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
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        memoryStaticSessions = { ...memoryStaticSessions, ...parsed };
        return memoryStaticSessions;
      }
    }
  } catch {
    // ignore
  }
  return { ...memoryStaticSessions };
}

function saveStaticSessionEntry(userKey: string, session: ActiveUserSession | null): void {
  const map = getStaticSessionsMap();
  if (session) {
    map[userKey] = session;
  } else {
    delete map[userKey];
  }
  memoryStaticSessions = map;
  try {
    localStorage.setItem(STATIC_SESSIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

let lastCloudHeartbeatCheckMs = 0;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  let sentSessionToken = '';
  if (url.startsWith('/api/sync') && !FirestoreSyncService.isCloudConnected()) {
    const current = getStoredUnifiedSession();
    if (
      current &&
      !current.session.sessionToken.startsWith('static-') &&
      !current.session.sessionToken.startsWith('cloud.')
    ) {
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

  // Chỉ đăng xuất nếu header lỗi phiên thuộc đúng phiên hiện đang lưu và không dùng khóa Cloud Firestore
  if (
    !FirestoreSyncService.isCloudConnected() &&
    invalidatedReason &&
    invalidatedReason !== 'missing' &&
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
  if (
    !current ||
    current.session.sessionToken.startsWith('static-') ||
    current.session.sessionToken.startsWith('cloud.')
  ) {
    return;
  }
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

async function verifySessionHeartbeat(forceImmediate = false): Promise<void> {
  if (isVerifyingSession || authTransitionCount > 0) return;
  const current = getStoredUnifiedSession();
  if (!current) return;

  const watchKey = canonicalUserSessionKey(current.user) || current.session.userKey;

  // Khi Cloud Firestore đang kết nối, onSnapshot nhận thay đổi tức thì; chỉ kiểm tra định kỳ mỗi 15s để bảo toàn hạn mức đọc
  if (FirestoreSyncService.isCloudConnected()) {
    const now = Date.now();
    if (!forceImmediate && now - lastCloudHeartbeatCheckMs < 15_000) {
      FirestoreSyncService.watchActiveSession(watchKey);
      return;
    }
    lastCloudHeartbeatCheckMs = now;
    isVerifyingSession = true;
    try {
      FirestoreSyncService.watchActiveSession(watchKey);
      const cloudRes = await FirestoreSyncService.verifySessionWithCloud(current.session);
      const latestLocal = getStoredUnifiedSession();
      if (
        authTransitionCount > 0 ||
        !latestLocal ||
        latestLocal.session.sessionToken !== current.session.sessionToken
      ) {
        return;
      }
      if (cloudRes.handled && !cloudRes.valid) {
        if (cloudRes.reason === 'disabled') {
          triggerLocalKickOut({ reason: 'disabled' });
        } else if (cloudRes.reason === 'force_logout') {
          triggerLocalKickOut({
            reason: 'force_logout',
            deviceLabel: cloudRes.forceLogoutBy?.deviceLabel,
            loginAt: cloudRes.forceLogoutBy?.at
          });
        } else if (cloudRes.reason === 'replaced') {
          triggerLocalKickOut({
            reason: 'replaced',
            deviceLabel: cloudRes.replacedBy?.deviceLabel,
            loginAt: cloudRes.replacedBy?.loginAt
          });
        }
      }
      return;
    } catch {
      return;
    } finally {
      isVerifyingSession = false;
    }
  }

  isVerifyingSession = true;
  try {
    const mySession = current.session;
    if (mySession.sessionToken.startsWith('cloud.')) {
      if (FirestoreSyncService.hasAuthenticatedCloudUser()) {
        const cloudRes = await FirestoreSyncService.verifySessionWithCloud(current.session);
        if (cloudRes.handled && !cloudRes.valid) {
          if (cloudRes.reason === 'disabled') {
            triggerLocalKickOut({ reason: 'disabled' });
          } else if (cloudRes.reason === 'force_logout') {
            triggerLocalKickOut({
              reason: 'force_logout',
              deviceLabel: cloudRes.forceLogoutBy?.deviceLabel,
              loginAt: cloudRes.forceLogoutBy?.at
            });
          } else if (cloudRes.reason === 'replaced') {
            triggerLocalKickOut({
              reason: 'replaced',
              deviceLabel: cloudRes.replacedBy?.deviceLabel,
              loginAt: cloudRes.replacedBy?.loginAt
            });
          }
        }
      }
      return;
    }

    if (mySession.sessionToken.startsWith('static-')) {
      const staticMap = getStaticSessionsMap();
      const activeStatic = staticMap[mySession.userKey];
      if (!activeStatic) {
        saveStaticSessionEntry(mySession.userKey, mySession);
        return;
      }
      if (activeStatic.sessionToken !== mySession.sessionToken) {
        if (getClientSessionIssuedAtMs(activeStatic) > getClientSessionIssuedAtMs(mySession)) {
          triggerLocalKickOut({
            reason: 'replaced',
            deviceLabel: activeStatic.deviceLabel,
            loginAt: activeStatic.loginAt
          });
        } else {
          saveStaticSessionEntry(mySession.userKey, mySession);
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
      } else if (res.reason === 'expired') {
        triggerLocalKickOut({ reason: 'expired' });
      }
      // Bỏ qua reason === 'missing' (do Serverless Lambda mới khởi tạo trên Vercel chưa có bộ nhớ tạm)
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

  const mySession = current.session;
  const myIssuedAt = getClientSessionIssuedAtMs(mySession);
  const myCanonical = canonicalUserSessionKey(current.user) || normUserKey(mySession.userKey);
  const remote =
    activeSessions?.[mySession.userKey] ||
    activeSessions?.[myCanonical] ||
    (current.user?.username ? activeSessions?.[normUserKey(current.user.username)] : undefined);

  let matchedUser: User | undefined;
  if (Array.isArray(manifestUsers)) {
    matchedUser = manifestUsers.find(
      (u) => normUserKey(u.username) === normUserKey(mySession.userKey) || u.id === mySession.userId
    );
    if (matchedUser && !matchedUser.isActive) {
      triggerLocalKickOut({ reason: 'disabled' });
      return false;
    }
  }

  // Khi đang kết nối Google Cloud Firestore, Firestore là nguồn sự thật duy nhất về phiên.
  // Tránh việc manifest cũ từ máy chủ nội bộ /api/sync can thiệp gây đăng xuất sai.
  if (FirestoreSyncService.isCloudConnected()) {
    return true;
  }

  // Nếu cùng đúng mã phiên hiện tại hoặc không có remote session -> giữ nguyên phiên hợp lệ
  if (!remote || remote.sessionToken === mySession.sessionToken || revokedLocalTokens.has(remote.sessionToken)) {
    return true;
  }

  const remoteIssuedAt = getClientSessionIssuedAtMs(remote);

  // CHỈ ngắt phiên nếu thiết bị khác phát hành phiên MỚI HƠN phiên này!
  // Tuyệt đối không để phiên cũ trên máy tính đá văng phiên mới vừa đăng nhập trên điện thoại!
  if (
    remote.deviceId &&
    remote.deviceId !== mySession.deviceId &&
    remoteIssuedAt > myIssuedAt
  ) {
    triggerLocalKickOut({
      reason: 'replaced',
      deviceLabel: remote.deviceLabel,
      loginAt: remote.loginAt
    });
    return false;
  }

  // Nếu phiên của thiết bị này MỚI HƠN hoặc BẰNG phiên từ server (vd máy tính chưa dọn dẹp kịp) -> bảo toàn phiên này!
  if (myIssuedAt >= remoteIssuedAt) {
    return true;
  }

  if (matchedUser) {
    const revokedAt = Number(matchedUser.sessionRevokedAt) || 0;
    if (revokedAt > 0 && myIssuedAt > 0 && myIssuedAt <= revokedAt) {
      if (remote && remoteIssuedAt > myIssuedAt) {
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

  return true;
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

async function reconcileLocalServerOnly(): Promise<boolean> {
  let pulledChanges = false;
  const tokenBeforeManifest = getStoredUnifiedSession()?.session.sessionToken || '';
  const manifest = await fetchJson<ServerManifest>(`/api/sync/manifest?t=${Date.now()}`);

  if (
    authTransitionCount === 0 &&
    !FirestoreSyncService.isCloudConnected() &&
    (getStoredUnifiedSession()?.session.sessionToken || '') === tokenBeforeManifest
  ) {
    inspectManifestActiveSessions(manifest.activeSessions, manifest.users);
  }

  StorageService.applyRemoteMeta({
    users: manifest.users,
    warehouses: manifest.warehouses,
    tombstones: manifest.tombstones
  });
  if (Array.isArray(manifest.osd)) {
    const osdChanged = StorageService.applyRemoteOsdReceipts(manifest.osd);
    if (osdChanged) {
      notifyOsdListeners(StorageService.getOsdReceipts());
    }
    lastKnownOsdRev = Math.max(lastKnownOsdRev, Number((manifest as any).osdRevision) || 0);
    if (osdChanged && (FirestoreSyncService.isCloudConnected() || FirestoreSyncService.hasAuthenticatedCloudUser())) {
      void FirestoreSyncService.pushOsdRealtimeToCloud().catch(() => {});
    }
  }

  // Fast-path: Nếu revision máy chủ không đổi và cục bộ không phát sinh thay đổi mới -> bỏ qua toàn bộ vòng lặp băm O(N)
  if (
    hasCompletedInitialLocalSync &&
    manifest.serverRevision === lastKnownServerRev &&
    !metaDirty &&
    !materialsDirty &&
    !localReceiptsDirty
  ) {
    return false;
  }

  const localUsers = StorageService.getUsers();
  const localWhs = StorageService.getWarehouses();
  const localTombstones = StorageService.getTombstones();
  const localMetaDigest = computeMetaDigest(localUsers, localWhs, localTombstones, StorageService.getOsdReceipts());

  if (metaDirty) {
    const metaRes = await fetchJson<{
      serverRevision: number;
      users: User[];
      warehouses: Warehouse[];
      tombstones: TombstoneMap;
      osd?: OsdReceipt[];
    }>('/api/sync/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        users: localUsers,
        warehouses: localWhs,
        tombstones: localTombstones,
        osd: StorageService.getOsdReceipts()
      })
    });
    StorageService.applyRemoteMeta({
      users: metaRes.users,
      warehouses: metaRes.warehouses,
      tombstones: metaRes.tombstones
    });
    if (Array.isArray(metaRes.osd) && metaRes.osd.length > 0) {
      StorageService.applyRemoteOsdReceipts(metaRes.osd);
    }
    metaDirty = false;
    lastKnownServerRev = Math.max(lastKnownServerRev, metaRes.serverRevision);
  }

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
    const localRep = Number(localRcp?.itemsReplacedAt) || 0;
    const srvRep = Number(entry.itemsReplacedAt) || 0;
    if (!localRcp) {
      inboundCodesToPull.push(entry.code);
    } else if (localRep > srvRep) {
      continue;
    } else if (
      srvRep > localRep ||
      localRcp.items.length < entry.itemCount ||
      computeInboundReceiptDigest(localRcp) !== entry.digest
    ) {
      inboundCodesToPull.push(entry.code);
    }
  }

  if (inboundCodesToPull.length > 0) {
    await pullMissingReceipts('inbound', inboundCodesToPull);
    pulledChanges = true;
  }

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
    const localRep = Number(localRcp?.itemsReplacedAt) || 0;
    const srvRep = Number(entry.itemsReplacedAt) || 0;
    if (!localRcp) {
      outboundCodesToPull.push(entry.code);
    } else if (localRep > srvRep) {
      continue;
    } else if (
      srvRep > localRep ||
      localRcp.items.length < entry.itemCount ||
      computeOutboundReceiptDigest(localRcp) !== entry.digest
    ) {
      outboundCodesToPull.push(entry.code);
    }
  }

  if (outboundCodesToPull.length > 0) {
    await pullMissingReceipts('outbound', outboundCodesToPull);
    pulledChanges = true;
  }

  localReceiptsDirty = false;

  const refreshedInbounds = StorageService.getInboundReceipts();
  const inboundsToPush: InboundReceipt[] = [];
  for (let i = 0; i < refreshedInbounds.length; i++) {
    const rcp = refreshedInbounds[i];
    const code = normKey(rcp.receiptCode || rcp.id);
    const srv = serverInMap.get(code);
    const localRep = Number(rcp.itemsReplacedAt) || 0;
    const srvRep = Number(srv?.itemsReplacedAt) || 0;
    if (
      !srv ||
      localRep > srvRep ||
      (localRep === srvRep && rcp.items.length > srv.itemCount) ||
      computeInboundReceiptDigest(rcp) !== srv.digest
    ) {
      inboundsToPush.push(rcp);
    }
  }
  if (inboundsToPush.length > 0) {
    await pushReceiptsChunked('inbound', inboundsToPush);
  }

  const refreshedOutbounds = StorageService.getOutboundReceipts();
  const outboundsToPush: OutboundReceipt[] = [];
  for (let i = 0; i < refreshedOutbounds.length; i++) {
    const rcp = refreshedOutbounds[i];
    const code = normKey(rcp.issueCode || rcp.id);
    const srv = serverOutMap.get(code);
    const localRep = Number(rcp.itemsReplacedAt) || 0;
    const srvRep = Number(srv?.itemsReplacedAt) || 0;
    if (
      !srv ||
      localRep > srvRep ||
      (localRep === srvRep && rcp.items.length > srv.itemCount) ||
      computeOutboundReceiptDigest(rcp) !== srv.digest
    ) {
      outboundsToPush.push(rcp);
    }
  }
  if (outboundsToPush.length > 0) {
    await pushReceiptsChunked('outbound', outboundsToPush);
  }

  const currentMats = StorageService.getMaterials();
  const prePullMatDigest = computeMaterialsDigest(currentMats);
  if (manifest.materialsCount > 0 && (currentMats.length === 0 || prePullMatDigest !== manifest.materialsDigest)) {
    await pullAllMaterials();
    pulledChanges = true;
  }

  if (materialsDirty) {
    await pushAllMaterialsChunked();
    materialsDirty = false;
  }

  lastKnownServerRev = Math.max(lastKnownServerRev, manifest.serverRevision);
  hasCompletedInitialLocalSync = true;
  return pulledChanges;
}

async function reconcileInternal(): Promise<{ cloudSuccess: boolean; localSuccess: boolean; error?: string }> {
  // Chỉ chạy đồng bộ khi người dùng đã đăng nhập (tránh việc thiết bị vừa xóa cache chưa login đẩy data rỗng)
  if (!getStoredUnifiedSession() && !FirestoreSyncService.hasAuthenticatedCloudUser()) {
    return { cloudSuccess: false, localSuccess: false };
  }

  // Không bao giờ chạy đồng bộ dữ liệu nặng tranh chấp băng thông khi người dùng đang thực hiện đăng nhập
  if (authTransitionCount > 0) {
    pendingReconcile = true;
    return { cloudSuccess: false, localSuccess: false };
  }

  if (isReconciling) {
    pendingReconcile = true;
    return { cloudSuccess: false, localSuccess: false };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateNetworkStatus(false);
    return {
      cloudSuccess: false,
      localSuccess: false,
      error: 'Thiết bị đang ngoại tuyến (Mất kết nối mạng)'
    };
  }

  isReconciling = true;
  notifySyncState(true);

  let cloudSuccess = false;
  let localSuccess = false;
  let syncError: string | undefined;

  try {
    // Đảm bảo xả sạch hàng đợi ghi đĩa cục bộ IndexedDB trước khi đọc và đẩy dữ liệu
    await StorageService.flush();

    // 1. Ưu tiên đồng bộ 2 chiều thời gian thực qua Cloud Firestore cho mọi tài khoản Google đã xác thực (Admin & Nhân sự)
    if (
      authTransitionCount === 0 &&
      (FirestoreSyncService.isCloudConnected() || FirestoreSyncService.hasAuthenticatedCloudUser())
    ) {
      const cloudRes = await FirestoreSyncService.reconcileWithCloudDetailed();
      cloudSuccess = cloudRes.ok;
      if (cloudRes.ok) {
        updateNetworkStatus(true);
      }
      // Bắc cầu đồng bộ OSD và Meta xuống máy chủ cục bộ /api/sync để thiết bị khác dùng tài khoản nội bộ cũng nhận được
      try {
        await reconcileLocalServerOnly();
        localSuccess = true;
      } catch {
        // bỏ qua nếu máy chủ cục bộ không khả dụng
      }
    } else {
      // 2. Fallback đồng bộ máy chủ cục bộ /api/sync khi chưa kết nối Google Cloud
      try {
        await reconcileLocalServerOnly();
        localSuccess = true;
        updateNetworkStatus(true);
      } catch (localErr) {
        syncError = localErr instanceof Error ? localErr.message : String(localErr);
        if (!FirestoreSyncService.isCloudConnected()) {
          console.warn('Local server sync unavailable:', localErr);
        }
      }
    }

    await StorageService.flush();
  } catch (err) {
    syncError = err instanceof Error ? err.message : String(err);
    console.warn('Background sync skipped or deferred:', err);
  } finally {
    isReconciling = false;
    notifySyncState(false);

    if (pendingReconcile) {
      if (authTransitionCount === 0) {
        pendingReconcile = false;
        void reconcileInternal();
      } else {
        schedulePush(180);
      }
    }
  }

  return { cloudSuccess, localSuccess, error: syncError };
}

function schedulePush(delayMs = 350): void {
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
          data.activeSessionToken &&
          !revokedLocalTokens.has(String(data.activeSessionToken)) &&
          current.session.sessionToken !== data.activeSessionToken
        ) {
          const myCanonical =
            canonicalUserSessionKey(current.user) || canonicalUserSessionKey(current.session.userKey);
          const dataCanonical = canonicalUserSessionKey(data.userKey);
          const isUserMatch =
            myCanonical === dataCanonical ||
            (current.session.userId && data.userId && current.session.userId === data.userId) ||
            normUserKey(current.session.userKey) === normUserKey(data.userKey);

          if (isUserMatch) {
            const myIssued = getClientSessionIssuedAtMs(current.session);
            const remoteIssued = Number(data.issuedAtMs) || 0;
            // Chỉ ngắt phiên hiện tại nếu thiết bị khác phát hành phiên MỚI HƠN phiên này!
            if (
              data.deviceId !== current.session.deviceId &&
              data.sessionToken !== current.session.sessionToken &&
              remoteIssued > myIssued
            ) {
              triggerLocalKickOut({
                reason: 'replaced',
                username: current.user.username,
                fullName: current.user.fullName,
                deviceLabel: data.deviceLabel,
                loginAt: data.loginAt
              });
            }
          }
        }
      } else if (data.type === 'sync:osd_mutation') {
        if (Array.isArray(data.osd)) {
          StorageService.applyRemoteOsdReceipts(data.osd, SyncService.getActorId());
          notifyOsdListeners(StorageService.getOsdReceipts());
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
            msg.activeSessionToken &&
            !revokedLocalTokens.has(String(msg.activeSessionToken)) &&
            current.session.sessionToken !== msg.activeSessionToken
          ) {
            const myCanonical =
              canonicalUserSessionKey(current.user) || canonicalUserSessionKey(current.session.userKey);
            const msgCanonical = canonicalUserSessionKey(msg.userKey);
            const isUserMatch =
              myCanonical === msgCanonical ||
              (current.session.userId && msg.userId && current.session.userId === msg.userId) ||
              normUserKey(current.session.userKey) === normUserKey(msg.userKey);

            if (isUserMatch) {
              const myIssued = getClientSessionIssuedAtMs(current.session);
              const remoteIssued = Number(msg.issuedAtMs) || 0;
              // Chỉ ngắt phiên nếu thiết bị khác phát hành phiên MỚI HƠN phiên này!
              if (
                msg.deviceId !== current.session.deviceId &&
                msg.activeSessionToken !== current.session.sessionToken &&
                remoteIssued > myIssued
              ) {
                triggerLocalKickOut({
                  reason: 'replaced',
                  username: current.user.username,
                  fullName: current.user.fullName,
                  deviceLabel: msg.deviceLabel,
                  loginAt: msg.loginAt
                });
              }
            }
          }
          return;
        }

        if (msg.type === 'sync:osd_updated') {
          if (Array.isArray(msg.osd)) {
            StorageService.applyRemoteOsdReceipts(msg.osd, SyncService.getActorId());
            notifyOsdListeners(StorageService.getOsdReceipts());
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

    purgeLegacySessionKeys();
    setupBroadcastChannel();

    FirestoreSyncService.init({
      isLocalSessionStillActive: (token: string) =>
        Boolean(
          token &&
            !revokedLocalTokens.has(token) &&
            getStoredUnifiedSession()?.session.sessionToken === token
        ),
      onRemoteWorkspaceChange: () => {
        void verifySessionHeartbeat(true);
        void reconcileInternal();
      },
      onRemoteOsdChange: (remoteOsd) => {
        if (Array.isArray(remoteOsd)) {
          StorageService.applyRemoteOsdReceipts(remoteOsd, SyncService.getActorId());
        }
        const currentList = StorageService.getOsdReceipts();
        notifyOsdListeners(currentList);
        // Bắc cầu: Đẩy dữ liệu OSD từ Cloud Firestore sang máy chủ /api/sync/osd để các thiết bị khác nhận được tức thì
        void fetchJson<{ ok: boolean; osdRevision: number }>('/api/sync/osd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: CLIENT_ID,
            osd: currentList,
            tombstones: StorageService.getTombstones().osd || {}
          })
        }).then((res) => {
          if (res.ok) {
            lastKnownOsdRev = Math.max(lastKnownOsdRev, Number(res.osdRevision) || 0);
          }
        }).catch(() => {});
      },
      onRemoteSessionSnapshot: (remoteData) => {
        if (authTransitionCount > 0) return;
        const current = getStoredUnifiedSession();
        if (!current) return;
        const myCanonical = canonicalUserSessionKey(current.user) || normUserKey(current.session.userKey);
        const remoteUserKey = String(remoteData.userKey || (remoteData as any).username || '');
        const remoteCanonical =
          canonicalUserSessionKey({ email: (remoteData as any).email, username: (remoteData as any).username }) ||
          normUserKey(remoteUserKey);
        const isMatch =
          !remoteUserKey ||
          myCanonical === remoteCanonical ||
          (current.session.userId && remoteData.userId && current.session.userId === remoteData.userId) ||
          normUserKey(current.session.userKey) === normUserKey(remoteUserKey) ||
          normUserKey(current.session.username) === normUserKey(remoteData.username);
        if (!isMatch) return;

        const remoteToken = String(remoteData.sessionToken || '');
        const remoteIssued = Number(remoteData.issuedAtMs) || 0;
        const revokedBefore = Number(remoteData.revokedBeforeMs) || 0;
        const myIssued = getClientSessionIssuedAtMs(current.session);

        // Nếu remoteToken rỗng (do thiết bị trước đã đăng xuất) hoặc đúng mã phiên này hoặc cùng thiết bị -> bỏ qua
        if (!remoteToken || remoteToken === current.session.sessionToken) return;
        if (remoteData.deviceId && remoteData.deviceId === current.session.deviceId) return;
        if (remoteToken && revokedLocalTokens.has(remoteToken)) return;

        // CHỈ ngắt phiên nếu thiết bị khác phát hành phiên MỚI HƠN phiên này!
        // Nếu phiên của máy tính cũ hơn phiên hiện tại của điện thoại (remoteIssued <= myIssued) -> TUYỆT ĐỐI KHÔNG ĐÁ!
        if (remoteIssued <= myIssued && (revokedBefore === 0 || myIssued > revokedBefore)) {
          return;
        }

        // Nếu phiên này được cấp TRƯỚC thời điểm revokedBefore -> bị đăng xuất từ xa
        if (revokedBefore > 0 && myIssued > 0 && myIssued <= revokedBefore) {
          triggerLocalKickOut({
            reason: 'force_logout',
            deviceLabel: remoteData.forceLogoutDeviceLabel || remoteData.deviceLabel
              ? String(remoteData.forceLogoutDeviceLabel || remoteData.deviceLabel)
              : 'Thiết bị khác',
            loginAt: remoteData.forceLogoutAt || remoteData.loginAt
              ? String(remoteData.forceLogoutAt || remoteData.loginAt)
              : undefined
          });
          return;
        }

        // Chỉ khi remoteIssued > myIssued mới là phiên bị thay thế bởi thiết bị mới hơn
        if (remoteIssued > myIssued) {
          triggerLocalKickOut({
            reason: 'replaced',
            deviceLabel: remoteData.forceLogoutDeviceLabel || remoteData.deviceLabel
              ? String(remoteData.forceLogoutDeviceLabel || remoteData.deviceLabel)
              : 'Thiết bị khác',
            loginAt: remoteData.forceLogoutAt || remoteData.loginAt
              ? String(remoteData.forceLogoutAt || remoteData.loginAt)
              : undefined
          });
        }
      }
    });

    StorageService.onLocalMutation((kind) => {
      if (kind === 'materials') {
        materialsDirty = true;
      } else if (kind === 'meta' || kind === 'osd') {
        metaDirty = true;
      } else if (kind === 'inbound' || kind === 'outbound') {
        localReceiptsDirty = true;
      }
      FirestoreSyncService.markLocalMutation(kind);
      if (kind === 'osd') {
        notifyOsdListeners(StorageService.getOsdReceipts());
        try {
          authChannel?.postMessage({
            type: 'sync:osd_mutation',
            osd: StorageService.getOsdReceipts()
          });
        } catch {
          // ignore
        }
        FirestoreSyncService.pushOsdRealtimeToCloud().catch(() => {});
      }
      // Debounce gom cụm các đột biến liên tiếp (nhất là khi import hàng loạt ~1000 dòng)
      schedulePush(350);
      try {
        authChannel?.postMessage({ type: 'sync:local_changed' });
      } catch {
        // ignore
      }
    });

    connectWebSocket();
    if (getStoredUnifiedSession()) {
      void verifySessionHeartbeat(true);
    }
    setTimeout(() => {
      void reconcileInternal();
    }, 80);

    if (typeof window !== 'undefined') {
      const wakeCheck = () => {
        connectWebSocket();
        sendWsAuthCheck();
        void verifySessionHeartbeat(true);
      };

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          wakeCheck();
        }
      });

      window.addEventListener('focus', wakeCheck);
      window.addEventListener('pageshow', wakeCheck);
      window.addEventListener('online', () => {
        updateNetworkStatus(true);
        wakeCheck();
        // Chỉ đồng bộ khi vừa có mạng trở lại sau thời gian ngoại tuyến
        void reconcileInternal();
      });
      window.addEventListener('offline', () => {
        updateNetworkStatus(false);
      });
      window.addEventListener('storage', (ev) => {
        if (ev.key === STATIC_SESSIONS_STORAGE_KEY) {
          void verifySessionHeartbeat();
        }
      });

      const handleInteraction = () => {
        const now = Date.now();
        if (now - lastInteractionCheckMs < 2000) return;
        lastInteractionCheckMs = now;
        if (getStoredUnifiedSession()) {
          if (!FirestoreSyncService.isCloudConnected()) {
            connectWebSocket();
          }
          void verifySessionHeartbeat();
        }
      };
      window.addEventListener('pointerdown', handleInteraction, { passive: true });
      window.addEventListener('keydown', handleInteraction, { passive: true });

      sessionHeartbeatTimer = setInterval(() => {
        if (getStoredUnifiedSession() && authTransitionCount === 0) {
          if (!FirestoreSyncService.isCloudConnected()) {
            connectWebSocket();
          }
          void verifySessionHeartbeat();
        }
      }, 5000);
    }
  },

  isOnline(): boolean {
    if (typeof navigator !== 'undefined') {
      return Boolean(navigator.onLine);
    }
    return true;
  },

  async checkNetworkOnline(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateNetworkStatus(false);
      return false;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/api/sync/manifest', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      const ok = res.ok || res.status === 401 || res.status === 403;
      updateNetworkStatus(ok);
      return ok;
    } catch {
      if (FirestoreSyncService.isCloudConnected()) {
        updateNetworkStatus(true);
        return true;
      }
      updateNetworkStatus(false);
      return false;
    }
  },

  subscribeNetworkStatus(listener: (online: boolean) => void): () => void {
    networkStatusListeners.add(listener);
    listener(this.isOnline());
    return () => {
      networkStatusListeners.delete(listener);
    };
  },

  async initialSync(timeoutMs = 4500): Promise<void> {
    await Promise.race([
      Promise.all([verifySessionHeartbeat(true), reconcileInternal()]),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  },

  async syncNow(): Promise<SyncResult> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : this.isOnline();
    if (!isOnline) {
      return {
        success: false,
        isOffline: true,
        message: 'Thiết bị đang ngoại tuyến. Dữ liệu hệ thống và OSD đã được lưu an toàn tại máy.',
        osdCount: StorageService.getOsdReceipts().length
      };
    }

    if (pushDebounceTimer) {
      clearTimeout(pushDebounceTimer);
      pushDebounceTimer = null;
    }

    notifySyncState(true);
    try {
      // Đảm bảo commit toàn bộ hàng đợi ghi IndexedDB trước khi phân tán luồng đồng bộ
      await StorageService.flush();

      let serverOk = false;
      let cloudOk = false;

      // Chạy SONG SONG các luồng đồng bộ độc lập để TỐI ĐA HÓA TỐC ĐỘ:
      const syncTasks: Promise<any>[] = [
        // 1. Đồng bộ nhịp tim phiên
        verifySessionHeartbeat(true).catch(() => {}),

        // 2. Đồng bộ chuyên biệt OSD 2 chiều qua /api/sync/osd
        (async () => {
          try {
            const localOsd = StorageService.getOsdReceipts();
            const localTombstones = StorageService.getTombstones();
            const res = await fetchJson<{
              ok: boolean;
              osdRevision: number;
              osd: OsdReceipt[];
              tombstones?: Record<string, number>;
            }>('/api/sync/osd', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId: CLIENT_ID,
                osd: localOsd,
                tombstones: localTombstones.osd || {}
              })
            });

            if (res.ok && Array.isArray(res.osd)) {
              StorageService.applyRemoteOsdReceipts(res.osd, this.getActorId());
              if (res.tombstones && typeof res.tombstones === 'object') {
                const tombs = StorageService.getTombstones();
                tombs.osd = { ...(tombs.osd || {}), ...res.tombstones };
                StorageService.saveTombstones(tombs);
              }
              notifyOsdListeners(StorageService.getOsdReceipts());
              serverOk = true;
              lastKnownOsdRev = Math.max(lastKnownOsdRev, Number(res.osdRevision) || 0);
            }
          } catch {
            // Fallback GET nhanh
            try {
              const fb = await fetchJson<{ ok: boolean; osd: OsdReceipt[] }>('/api/sync/osd');
              if (fb.ok && Array.isArray(fb.osd)) {
                StorageService.applyRemoteOsdReceipts(fb.osd, this.getActorId());
                notifyOsdListeners(StorageService.getOsdReceipts());
                serverOk = true;
              }
            } catch {}
          }
        })(),

        // 3. Đồng bộ toàn bộ dữ liệu hệ thống (Người dùng, Kho bãi, Vật tư, Phiếu nhập xuất)
        (async () => {
          try {
            const reconRes = await reconcileInternal();
            if (reconRes.cloudSuccess) cloudOk = true;
            if (reconRes.localSuccess) serverOk = true;
          } catch {}
        })()
      ];

      // Nếu Cloud đang kết nối, kích hoạt đẩy OSD lên Cloud Firestore song song
      if (FirestoreSyncService.isCloudConnected() || FirestoreSyncService.hasAuthenticatedCloudUser()) {
        syncTasks.push(
          FirestoreSyncService.pushOsdRealtimeToCloud()
            .then((ok) => {
              if (ok) cloudOk = true;
            })
            .catch(() => {})
        );
      }

      await Promise.all(syncTasks);
      await StorageService.flush();

      const finalOsdCount = StorageService.getOsdReceipts().length;
      const finalMatCount = StorageService.getMaterials().length;

      return {
        success: true,
        message: `Đồng bộ toàn bộ dữ liệu & OSD thành công (${finalOsdCount} biên bản OSD, ${finalMatCount} vật tư)!`,
        cloudSynced: cloudOk,
        localSynced: serverOk,
        osdCount: finalOsdCount
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        message: `Đồng bộ bị gián đoạn: ${err?.message || 'Lỗi mạng'}. Dữ liệu trên máy vẫn an toàn.`,
        osdCount: StorageService.getOsdReceipts().length
      };
    } finally {
      notifySyncState(false);
    }
  },

  async syncOsd(): Promise<SyncResult> {
    // Gộp trực tiếp hành động đồng bộ OSD với đồng bộ dữ liệu làm một!
    return this.syncNow();
  },

  async pushOsdImmediately(): Promise<void> {
    try {
      const localOsd = StorageService.getOsdReceipts();
      const localTombstones = StorageService.getTombstones();
      notifyOsdListeners(localOsd);

      try {
        authChannel?.postMessage({
          type: 'sync:osd_mutation',
          osd: localOsd
        });
      } catch {
        // ignore
      }

      void fetchJson<{
        ok: boolean;
        osdRevision: number;
        osd: OsdReceipt[];
      }>('/api/sync/osd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: CLIENT_ID,
          osd: localOsd,
          tombstones: localTombstones.osd || {}
        })
      }).then((res) => {
        if (res.ok && Array.isArray(res.osd)) {
          StorageService.applyRemoteOsdReceipts(res.osd, this.getActorId());
          notifyOsdListeners(res.osd);
          lastKnownOsdRev = Math.max(lastKnownOsdRev, Number(res.osdRevision) || 0);
        }
      }).catch(() => {});

      if (FirestoreSyncService.isCloudConnected() || FirestoreSyncService.hasAuthenticatedCloudUser()) {
        void FirestoreSyncService.pushOsdRealtimeToCloud().catch(() => {});
      }
    } catch {
      // ignore
    }
  },

  getCloudState(): CloudSyncSnapshotState {
    return FirestoreSyncService.getState();
  },

  hasAuthenticatedCloudUser(): boolean {
    return FirestoreSyncService.hasAuthenticatedCloudUser();
  },

  subscribeCloudState(listener: (state: CloudSyncSnapshotState) => void): () => void {
    return FirestoreSyncService.subscribeState(listener);
  },

  async connectCloudSync(): Promise<{ success: boolean; message: string; email?: string | null }> {
    notifySyncState(true);
    try {
      const res = await FirestoreSyncService.connectGoogleAccount();
      if (res.success) {
        const current = getStoredUnifiedSession();
        if (current) {
          await FirestoreSyncService.syncActiveSessionToCloudIfConnected(current.session);
        }
        await reconcileInternal();
      }
      return res;
    } finally {
      notifySyncState(false);
    }
  },

  async syncUsersToCloudImmediately(): Promise<{ success: boolean; message: string; count?: number }> {
    metaDirty = true;
    FirestoreSyncService.markLocalMutation('meta');
    // Luôn bắc cầu xuống /api/sync/meta của server Express
    void fetch('/api/sync/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        users: StorageService.getUsers(),
        warehouses: StorageService.getWarehouses(),
        tombstones: StorageService.getTombstones(),
        osd: StorageService.getOsdReceipts()
      })
    }).catch(() => {});

    if (FirestoreSyncService.isCloudConnected() || FirestoreSyncService.hasAuthenticatedCloudUser()) {
      return await FirestoreSyncService.forcePushUsersOnlyToCloud();
    }

    return {
      success: true,
      count: StorageService.getUsers().length,
      message: 'Đã lưu tài khoản người dùng tại máy và máy chủ nội bộ. Vui lòng bấm "Đồng Bộ Cloud" để đồng bộ sang thiết bị khác.'
    };
  },

  async forcePushAllLocalDataToCloud(): Promise<{
    success: boolean;
    message: string;
    stats?: {
      users: number;
      warehouses: number;
      materials: number;
      inbound: number;
      outbound: number;
      osd: number;
    };
  }> {
    notifySyncState(true);
    try {
      if (!FirestoreSyncService.isCloudConnected() && !FirestoreSyncService.hasAuthenticatedCloudUser()) {
        const connRes = await this.connectCloudSync();
        if (!connRes.success) {
          return {
            success: false,
            message: connRes.message || 'Chưa thể kết nối Google Cloud để đồng bộ dữ liệu.'
          };
        }
      }
      return await FirestoreSyncService.forcePushAllLocalDataToCloud();
    } finally {
      notifySyncState(false);
    }
  },

  async disconnectCloudSync(): Promise<void> {
    await FirestoreSyncService.disconnectGoogleAccount();
  },

  async loginWithGoogleCloud(options?: {
    forceLogoutOtherDevice?: boolean;
    forceSelectAccount?: boolean;
    reuseExistingAccount?: boolean;
  }): Promise<LoginServerResult> {
    authTransitionCount++;
    ++authAttemptEpoch;
    const forceFlag = Boolean(options?.forceLogoutOtherDevice);

    // Dọn dẹp đồng bộ phiên cũ trong RAM/sessionStorage ngay trước khi gọi Google Popup (không await mạng để tránh Chrome chặn Popup)
    const prevUnified = getStoredUnifiedSession();
    if (prevUnified) {
      rememberRevokedLocalToken(prevUnified.session.sessionToken);
      FirestoreSyncService.watchActiveSession(null);
      clearStoredUnifiedSession();
      void FirestoreSyncService.logoutFromCloud(prevUnified.session).catch(() => {});
      if (
        !prevUnified.session.sessionToken.startsWith('static-') &&
        !prevUnified.session.sessionToken.startsWith('cloud.')
      ) {
        void fetch('/api/auth/logout', {
          method: 'POST',
          keepalive: true,
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userKey: prevUnified.session.userKey,
            sessionToken: prevUnified.session.sessionToken,
            deviceId: prevUnified.session.deviceId
          })
        }).catch(() => {});
      }
    }
    clearBrowserAuthCookiesAndArtifacts(prevUnified?.session.userKey);

    try {
      // Khởi động nạp IndexedDB song song ngay trong lúc hộp thoại Google Popup đang mở (không await trước popup để tránh bị trình duyệt chặn)
      const storageInitTask = StorageService.init();

      const authRes = await FirestoreSyncService.authenticateGooglePopup({
        forceSelectAccount: Boolean(options?.forceSelectAccount),
        reuseExistingIfAvailable: Boolean(options?.reuseExistingAccount || forceFlag)
      });

      if (!authRes.success || !authRes.email) {
        return {
          success: false,
          message: authRes.message || 'Không thể xác thực tài khoản Google.'
        };
      }

      await storageInitTask;

      const emailLower = authRes.email.trim().toLowerCase();
      const displayName = authRes.displayName || null;
      const uid = authRes.uid || null;
      const deviceId = getDeviceId();
      const deviceLabel = getDeviceLabel();

      // 1. Ưu tiên cấp phiên tốc độ cao trên Cloud Firestore
      if (authRes.cloudReady && authRes.fbUser) {
        let cloudRes = await FirestoreSyncService.loginWithGoogleIdentityOnCloud(
          authRes.fbUser,
          deviceId,
          deviceLabel,
          forceFlag,
          12000
        );

        if (
          cloudRes.handled &&
          cloudRes.conflict &&
          !forceFlag &&
          cloudRes.activeSession &&
          revokedLocalTokens.has(cloudRes.activeSession.sessionToken)
        ) {
          cloudRes = await FirestoreSyncService.loginWithGoogleIdentityOnCloud(
            authRes.fbUser,
            deviceId,
            deviceLabel,
            true,
            12000
          );
        }

        if (cloudRes.handled) {
          if (!cloudRes.success || !cloudRes.user || !cloudRes.session) {
            if (!cloudRes.conflict) {
              await FirestoreSyncService.disconnectGoogleAccount().catch(() => {});
            }
            return {
              success: false,
              conflict: cloudRes.conflict,
              activeSession: cloudRes.activeSession,
              user: cloudRes.user,
              message: cloudRes.message || 'Không thể đăng nhập bằng tài khoản Google này.'
            };
          }

          pendingInvalidation = null;
          clearPersistedKickNotice();
          saveStoredUnifiedSession({
            user: cloudRes.user,
            session: cloudRes.session
          });

          // Đồng bộ ngầm tài khoản Google lên máy chủ /api để luôn đồng nhất dữ liệu
          void fetch('/api/auth/google-login', {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: emailLower,
              displayName,
              uid,
              deviceId,
              deviceLabel,
              sessionToken: cloudRes.session.sessionToken,
              issuedAtMs: cloudRes.session.issuedAtMs,
              localUsers: StorageService.getUsers(),
              forceLogoutOtherDevice: true
            })
          }).catch(() => {});

          try {
            authChannel?.postMessage({
              type: 'auth:session_replaced',
              userKey: cloudRes.session.userKey,
              activeSessionToken: cloudRes.session.sessionToken,
              issuedAtMs: cloudRes.session.issuedAtMs,
              deviceLabel: cloudRes.session.deviceLabel,
              loginAt: cloudRes.session.loginAt
            });
          } catch {
            // ignore
          }

          // Nhường trình duyệt render giao diện chính ngay lập tức rồi mới đồng bộ dữ liệu kho dưới nền
          setTimeout(() => {
            void reconcileInternal();
          }, 120);

          return {
            success: true,
            user: cloudRes.user,
            replacedSession: cloudRes.replacedSession,
            message: cloudRes.message
          };
        }
      }

      // 2. Fallback tốc độ cao (~20ms) qua máy chủ /api/auth/google-login (khi Firestore chạm hạn mức hoặc mạng Cloud phản hồi chậm >950ms)
      try {
        const localUsers = StorageService.getUsers();
        const attemptGoogleServerLogin = (forceOther: boolean) =>
          fetchJson<{
            success: boolean;
            conflict?: boolean;
            activeSession?: ActiveUserSession;
            message: string;
            user?: User;
            session?: ActiveUserSession;
            replacedSession?: ActiveUserSession;
            users?: User[];
          }>('/api/auth/google-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: emailLower,
              displayName,
              uid,
              deviceId,
              deviceLabel,
              localUsers,
              forceLogoutOtherDevice: forceOther
            })
          });

        let res = await attemptGoogleServerLogin(forceFlag);
        if (
          res.conflict &&
          !forceFlag &&
          res.activeSession &&
          revokedLocalTokens.has(res.activeSession.sessionToken)
        ) {
          res = await attemptGoogleServerLogin(true);
        }

        if (!res.success || !res.user || !res.session) {
          if (!res.conflict) {
            await FirestoreSyncService.disconnectGoogleAccount().catch(() => {});
          }
          return {
            success: false,
            conflict: Boolean(res.conflict),
            activeSession: res.activeSession,
            user: res.user,
            message: res.message || 'Không thể đăng nhập bằng tài khoản Google này.'
          };
        }

        pendingInvalidation = null;
        clearPersistedKickNotice();
        const issuedServerSession = res.session;
        saveStoredUnifiedSession({
          user: res.user,
          session: issuedServerSession
        });

        if (Array.isArray(res.users) && res.users.length > 0) {
          StorageService.applyRemoteMeta({ users: res.users });
        } else {
          StorageService.applyRemoteMeta({ users: [res.user] });
        }

        try {
          authChannel?.postMessage({
            type: 'auth:session_replaced',
            userKey: issuedServerSession.userKey,
            activeSessionToken: issuedServerSession.sessionToken,
            issuedAtMs: issuedServerSession.issuedAtMs,
            deviceLabel: issuedServerSession.deviceLabel,
            loginAt: issuedServerSession.loginAt
          });
        } catch {
          // ignore
        }

        connectWebSocket();
        sendWsAuthCheck();

        // Mở giao diện chính ngay tức thì, đồng bộ phiên lên Cloud và dữ liệu kho hoàn toàn dưới nền
        setTimeout(() => {
          if (authRes.fbUser) {
            void FirestoreSyncService.syncActiveSessionToCloudIfConnected(issuedServerSession).catch(() => {});
          }
          void reconcileInternal();
        }, 120);

        return {
          success: true,
          user: res.user,
          replacedSession: res.replacedSession,
          message: res.message
        };
      } catch {
        // 3. Fallback cục bộ an toàn khi triển khai tĩnh không có /api
        const nowMs = Date.now();
        const resolved = resolveGoogleUserRecord(StorageService.getUsers(), {
          email: emailLower,
          displayName,
          uid,
          nowMs
        });
        if (!resolved.allowed) {
          await FirestoreSyncService.disconnectGoogleAccount().catch(() => {});
          return {
            success: false,
            message: resolved.message || 'Tài khoản Google này đang bị khóa truy cập.'
          };
        }

        const matched =
          resolved.isNew || resolved.mutated
            ? StorageService.upsertGoogleUser(resolved.user)
            : resolved.user;
        const userKey = normUserKey(matched.username);
        const staticMap = getStaticSessionsMap();
        const prevStatic = staticMap[userKey];

        if (
          prevStatic &&
          prevStatic.deviceId !== deviceId &&
          !revokedLocalTokens.has(prevStatic.sessionToken) &&
          isSessionHeartbeatFresh(nowMs, prevStatic.lastSeenAt, STATIC_TTL_MS) &&
          !forceFlag
        ) {
          return {
            success: false,
            conflict: true,
            activeSession: prevStatic,
            user: matched,
            message: `Tài khoản Google "${emailLower}" hiện đang mở trên ${prevStatic.deviceLabel || 'thiết bị khác'}. Nhấn nút bên dưới để đăng xuất thiết bị kia và tiếp tục.`
          };
        }

        const issuedAtMs = Math.max(
          nowMs,
          (Number(matched.sessionRevokedAt) || 0) + 2,
          (Number(prevStatic?.issuedAtMs) || 0) + 2
        );
        const nowIso = new Date(issuedAtMs).toISOString();
        const staticSession: ActiveUserSession = {
          userId: matched.id,
          username: matched.username,
          userKey,
          sessionToken: `static-${issuedAtMs}-${Math.random().toString(36).slice(2, 10)}`,
          issuedAtMs,
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

        return {
          success: true,
          user: matched,
          replacedSession: prevStatic && prevStatic.deviceId !== deviceId ? prevStatic : undefined,
          message: `Đăng nhập thành công với ${emailLower}!`
        };
      }
    } finally {
      authTransitionCount = Math.max(0, authTransitionCount - 1);
    }
  },

  async requestLogoutOtherDeviceWithGoogle(): Promise<{ success: boolean; message: string }> {
    authTransitionCount++;
    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();

    try {
      let fbUser = FirestoreSyncService.getCurrentFirebaseUser();
      if (!fbUser || !fbUser.email) {
        const authRes = await FirestoreSyncService.authenticateGooglePopup({
          forceSelectAccount: true,
          reuseExistingIfAvailable: false
        });
        if (!authRes.success || !authRes.fbUser || !authRes.email) {
          return {
            success: false,
            message: authRes.message || 'Vui lòng xác thực tài khoản Google để đăng xuất thiết bị kia.'
          };
        }
        fbUser = authRes.fbUser;
      }

      await StorageService.init();
      const emailLower = (fbUser.email || '').trim().toLowerCase();
      if (!emailLower) {
        return {
          success: false,
          message: 'Không đọc được địa chỉ email từ tài khoản Google.'
        };
      }

      const cloudRes = await FirestoreSyncService.requestLogoutOtherDeviceByGoogleWithCloud(
        fbUser,
        deviceLabel
      );
      if (cloudRes.handled && cloudRes.success) {
        void fetch('/api/auth/force-logout', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleEmail: emailLower,
            deviceId,
            deviceLabel,
            localUsers: StorageService.getUsers()
          })
        }).catch(() => {});
        return {
          success: true,
          message: cloudRes.message
        };
      }
      if (cloudRes.handled && !cloudRes.success) {
        return {
          success: false,
          message: cloudRes.message
        };
      }

      const res = await fetchJson<{
        success: boolean;
        message: string;
        users?: User[];
      }>('/api/auth/force-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleEmail: emailLower,
          deviceId,
          deviceLabel,
          localUsers: StorageService.getUsers()
        })
      });

      if (Array.isArray(res.users) && res.users.length > 0) {
        StorageService.applyRemoteMeta({ users: res.users });
      }
      return {
        success: res.success,
        message:
          res.message ||
          (res.success
            ? 'Đã đăng xuất phiên trên thiết bị kia thành công!'
            : 'Không thể gửi yêu cầu đăng xuất thiết bị kia.')
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối để đăng xuất thiết bị kia. Bạn có thể nhấn trực tiếp "Đăng xuất thiết bị kia & Tiếp tục".'
      };
    } finally {
      authTransitionCount = Math.max(0, authTransitionCount - 1);
    }
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
    await verifySessionHeartbeat(true);
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
    const cleanUsername = String(username || '').normalize('NFC').trim();
    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();
    const forceLogoutOtherDevice = Boolean(options?.forceLogoutOtherDevice);

    try {
      await awaitPendingLogout(1800);

      // Nếu trình duyệt còn kẹt phiên cũ trong RAM/sessionStorage, thu hồi ngay trước khi tạo phiên mới
      const prevUnified = getStoredUnifiedSession();
      if (prevUnified) {
        rememberRevokedLocalToken(prevUnified.session.sessionToken);
        FirestoreSyncService.watchActiveSession(null);
        clearStoredUnifiedSession();
        void FirestoreSyncService.logoutFromCloud(prevUnified.session).catch(() => {});
        if (
          !prevUnified.session.sessionToken.startsWith('static-') &&
          !prevUnified.session.sessionToken.startsWith('cloud.')
        ) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            keepalive: true,
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userKey: prevUnified.session.userKey,
              sessionToken: prevUnified.session.sessionToken,
              deviceId: prevUnified.session.deviceId
            })
          }).catch(() => {});
        }
      }

      clearBrowserAuthCookiesAndArtifacts(cleanUsername);

      // Đảm bảo IndexedDB cục bộ và phiên Google Cloud trên trình duyệt Chrome đã sẵn sàng trước khi xác thực
      await StorageService.init();
      await FirestoreSyncService.ensureReadyForAuth(2500);

      // Ưu tiên Cloud Firestore nếu thiết bị có phiên Google Đám mây hợp lệ; nếu lỗi tự động chuyển tiếp xuống /api/auth/login
      if (FirestoreSyncService.canAttemptCloudAuth()) {
        try {
          let cloudRes = await FirestoreSyncService.loginWithCloud(
            cleanUsername,
            password,
            deviceId,
            deviceLabel,
            forceLogoutOtherDevice
          );
          if (
            cloudRes.handled &&
            cloudRes.conflict &&
            !forceLogoutOtherDevice &&
            cloudRes.activeSession &&
            revokedLocalTokens.has(cloudRes.activeSession.sessionToken)
          ) {
            cloudRes = await FirestoreSyncService.loginWithCloud(
              cleanUsername,
              password,
              deviceId,
              deviceLabel,
              true
            );
          }
          if (cloudRes.handled) {
            if (!cloudRes.success || !cloudRes.user || !cloudRes.session) {
              return {
                success: false,
                conflict: Boolean(cloudRes.conflict),
                activeSession: cloudRes.activeSession,
                message: cloudRes.message || 'Đăng nhập không thành công.'
              };
            }

            pendingInvalidation = null;
            clearPersistedKickNotice();
            saveStoredUnifiedSession({
              user: cloudRes.user,
              session: cloudRes.session
            });

            try {
              authChannel?.postMessage({
                type: 'auth:session_replaced',
                userKey: cloudRes.session.userKey,
                activeSessionToken: cloudRes.session.sessionToken,
                issuedAtMs: cloudRes.session.issuedAtMs,
                deviceLabel: cloudRes.session.deviceLabel,
                loginAt: cloudRes.session.loginAt
              });
            } catch {
              // ignore
            }

            queueMicrotask(() => {
              void reconcileInternal();
            });

            return {
              success: true,
              message: cloudRes.message,
              user: cloudRes.user,
              replacedSession: cloudRes.replacedSession
            };
          }
        } catch (cloudLoginErr) {
          console.warn('Cloud login skipped, falling back to /api/auth/login:', cloudLoginErr);
        }
      }

      const localUsers = StorageService.getUsers();
      const attemptLogin = (forceFlag: boolean) =>
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
            username: cleanUsername,
            password,
            deviceId,
            deviceLabel,
            localUsers,
            forceLogoutOtherDevice: forceFlag
          })
        });

      let res;
      try {
        res = await attemptLogin(forceLogoutOtherDevice);
      } catch (firstErr) {
        if (firstErr instanceof ApiRouteMissingError) {
          throw firstErr;
        }
        await new Promise((r) => setTimeout(r, 450));
        res = await attemptLogin(forceLogoutOtherDevice);
      }

      if (
        res.conflict &&
        !forceLogoutOtherDevice &&
        res.activeSession &&
        revokedLocalTokens.has(res.activeSession.sessionToken)
      ) {
        res = await attemptLogin(true);
      }

      if (!res.success || !res.user || !res.session) {
        const isNotFoundErr =
          !res.conflict &&
          Boolean(res.message) &&
          res.message.toLowerCase().includes('không tồn tại');
        const cloudDisconnected = !FirestoreSyncService.isCloudConnected();

        if (isNotFoundErr && cloudDisconnected) {
          return {
            success: false,
            needsCloudConnect: true,
            message: `Tài khoản "${cleanUsername}" chưa được đồng bộ về trình duyệt Chrome này. Hãy nhấn nút "Kết nối Đám mây & Đăng nhập ngay" bên dưới (chỉ cần 1 lần trên máy tính này) để tải danh sách tài khoản mới nhất từ đám mây và tự động đăng nhập!`
          };
        }

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
      } else {
        StorageService.applyRemoteMeta({ users: [res.user] });
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
    } catch {
      // Fallback xác thực an toàn trên dữ liệu cục bộ nếu máy chủ /api chưa phản hồi (vd: môi trường tĩnh hoặc mạng chập chờn)
      const localUsers = StorageService.getUsers();
      const matched = findMatchingUser(localUsers, cleanUsername);
      if (!matched) {
        return {
          success: false,
          needsCloudConnect: !FirestoreSyncService.isCloudConnected(),
          message: `Tài khoản "${cleanUsername}" chưa có trên trình duyệt Chrome này. Hãy nhấn "Kết nối Đám mây & Đăng nhập ngay" bên dưới để tải danh sách tài khoản từ đám mây về máy tính!`
        };
      }
      if (!matched.isActive) {
        return {
          success: false,
          message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt. Vui lòng liên hệ Admin.'
        };
      }
      if (!isPasswordMatch(matched.password, password)) {
        return {
          success: false,
          message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
        };
      }

      const nowMs = Date.now();
      const userKey = normUserKey(matched.username);
      const staticMap = getStaticSessionsMap();
      const prevStatic = staticMap[userKey];

      if (
        prevStatic &&
        prevStatic.deviceId !== deviceId &&
        !revokedLocalTokens.has(prevStatic.sessionToken) &&
        isSessionHeartbeatFresh(nowMs, prevStatic.lastSeenAt, STATIC_TTL_MS) &&
        !forceLogoutOtherDevice
      ) {
        return {
          success: false,
          conflict: true,
          activeSession: prevStatic,
          message: `Tài khoản "${matched.username}" hiện đang đăng nhập trên ${prevStatic.deviceLabel || 'thiết bị khác'}. Vui lòng nhấn "Yêu cầu đăng xuất trên thiết bị kia" để tiếp tục.`
        };
      }

      const issuedAtMs = Math.max(
        nowMs,
        (Number(matched.sessionRevokedAt) || 0) + 2,
        (Number(prevStatic?.issuedAtMs) || 0) + 2
      );
      const nowIso = new Date(issuedAtMs).toISOString();

      const staticSession: ActiveUserSession = {
        userId: matched.id,
        username: matched.username,
        userKey,
        sessionToken: `static-${issuedAtMs}-${Math.random().toString(36).slice(2, 10)}`,
        issuedAtMs,
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
          issuedAtMs,
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

    try {
      await StorageService.init();
      await FirestoreSyncService.ensureReadyForAuth(2500);

      if (FirestoreSyncService.canAttemptCloudAuth()) {
        const cloudRes = await FirestoreSyncService.requestLogoutOtherDeviceWithCloud(
          username,
          password,
          deviceLabel
        );
        if (cloudRes.handled) {
          if (cloudRes.success) {
            const matchedCloud = findMatchingUser(StorageService.getUsers(), username);
            const targetKey = normUserKey(matchedCloud?.username || username);
            const current = getStoredUnifiedSession();
            if (current && normUserKey(current.session.userKey) === targetKey) {
              clearStoredUnifiedSession();
            }
          }
          return {
            success: cloudRes.success,
            message: cloudRes.message
          };
        }
      }

      const localUsers = StorageService.getUsers();
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
    } catch {
      const localUsers = StorageService.getUsers();
      const matched = findMatchingUser(localUsers, username);
      if (!matched) {
        return {
          success: false,
          message: `Tài khoản "${username}" không tồn tại trong hệ thống.`
        };
      }
      if (!isPasswordMatch(matched.password, password)) {
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
      if (FirestoreSyncService.isCloudConnected()) {
        const cloudRes = await FirestoreSyncService.forceLogoutOthersKeepCurrentWithCloud(current);
        if (cloudRes.handled) {
          if (cloudRes.success && cloudRes.session) {
            saveStoredUnifiedSession({
              user: current.user,
              session: cloudRes.session
            });
          }
          return {
            success: cloudRes.success,
            message: cloudRes.message
          };
        }
      }

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
    const logoutEpoch = ++authAttemptEpoch;
    const current = getStoredUnifiedSession();
    if (current?.session.sessionToken) {
      rememberRevokedLocalToken(current.session.sessionToken);
    }
    FirestoreSyncService.watchActiveSession(null);
    clearStoredUnifiedSession();
    clearBrowserAuthCookiesAndArtifacts(current?.session.userKey);

    let releaseTask: Promise<void> | null = null;
    releaseTask = (async () => {
      authTransitionCount++;
      try {
        if (current) {
          // Giải phóng khóa phiên trên Cloud Firestore TRƯỚC khi signOut Firebase Auth để đảm bảo quyền ghi hợp lệ
          await Promise.race([
            FirestoreSyncService.logoutFromCloud(current.session),
            new Promise<void>((resolve) => setTimeout(resolve, 1200))
          ]);

          const staticMap = getStaticSessionsMap();
          if (staticMap[current.session.userKey]?.sessionToken === current.session.sessionToken) {
            saveStaticSessionEntry(current.session.userKey, null);
          }

          // Luôn dọn dẹp phiên trên máy chủ Express nội bộ để không bị kẹt phiên cũ khi đổi sang điện thoại
          if (!current.session.sessionToken.startsWith('static-')) {
            await Promise.race([
              fetch('/api/auth/logout', {
                method: 'POST',
                keepalive: true,
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userKey: current.session.userKey,
                  sessionToken: current.session.sessionToken,
                  deviceId: current.session.deviceId
                })
              }).then(() => {}),
              new Promise<void>((resolve) => setTimeout(resolve, 1200))
            ]).catch(() => {});
          }
        }

        // Luôn đăng xuất hoàn toàn tài khoản Google khỏi Firebase Auth nếu người dùng chưa bấm phiên đăng nhập mới
        if (authAttemptEpoch === logoutEpoch) {
          await FirestoreSyncService.disconnectGoogleAccount().catch(() => {});
        }
      } finally {
        authTransitionCount = Math.max(0, authTransitionCount - 1);
        if (releaseTask && inFlightLogoutPromise === releaseTask) {
          inFlightLogoutPromise = null;
        }
      }
    })();

    inFlightLogoutPromise = releaseTask;
    await releaseTask;
  },

  async resetBrowserAuthState(): Promise<{ success: boolean; message: string }> {
    authTransitionCount++;
    const resetEpoch = ++authAttemptEpoch;
    try {
      await this.logoutFromServer();
      memoryStaticSessions = {};
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(STATIC_SESSIONS_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      clearBrowserAuthCookiesAndArtifacts();

      if (authAttemptEpoch >= resetEpoch) {
        await FirestoreSyncService.disconnectGoogleAccount().catch(() => {});
      }

      return {
        success: true,
        message:
          'Đã thoát hoàn toàn phiên Google cũ và dọn sạch dữ liệu đăng nhập trên trình duyệt. Bạn có thể đăng nhập bằng Google ngay!'
      };
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

  subscribeOsd(listener: (osdList: OsdReceipt[]) => void): () => void {
    osdUpdateListeners.add(listener);
    try {
      listener(StorageService.getOsdReceipts());
    } catch {
      // ignore
    }
    return () => {
      osdUpdateListeners.delete(listener);
    };
  },

  getActorId(): string {
    const current = getStoredUnifiedSession();
    return current?.user?.username || current?.session?.deviceId || CLIENT_ID;
  },

  compareVersionVectors(v1?: VersionVector, v2?: VersionVector): VectorComparison {
    return compareVersionVectors(v1, v2);
  },

  mergeVersionVectors(v1?: VersionVector, v2?: VersionVector): VersionVector {
    return mergeVersionVectors(v1, v2);
  },

  incrementVersionVector(v: VersionVector | undefined, actorId?: string): VersionVector {
    return incrementVersionVector(v, actorId || this.getActorId());
  },

  resolveConcurrentOsd(curr: OsdReceipt, inc: OsdReceipt, actorId?: string): OsdReceipt {
    return resolveConcurrentOsd(curr, inc, actorId || this.getActorId());
  },

  stop(): void {
    if (sessionHeartbeatTimer) clearInterval(sessionHeartbeatTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
    isStarted = false;
  }
};
