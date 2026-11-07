import express, { type Express } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  OutboundReceipt,
  TombstoneMap,
  ActiveUserSession,
  OsdReceipt
} from '../types/inventory.ts';
import {
  createEmptyTombstones,
  normKey,
  normUserKey,
  computeEmailAuthDigest,
  isBootstrappedAdminUser,
  resolveGoogleUserRecord,
  isSessionHeartbeatFresh,
  isPasswordMatch,
  findMatchingUser,
  isRecordDeleted,
  computeMetaDigest,
  computeMaterialsDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  mergeTombstones,
  mergeUsersAdditive,
  mergeWarehousesAdditive,
  mergeMaterialsAdditive,
  mergeInboundReceiptsAdditive,
  mergeOutboundReceiptsAdditive,
  mergeOsdReceiptsAdditive,
  canonicalUserSessionKey
} from '../utils/additiveMerge.ts';

const SESSION_HMAC_SECRET =
  process.env.SESSION_SECRET || 'vtp-inventory-single-device-hmac-secret-2026-v2';

// Ngưỡng 24 giờ bảo vệ toàn vẹn phiên; phiên chỉ giải phóng khi người dùng đăng xuất hoặc thiết bị khác force-logout
const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const ROOT_ADMIN_FALLBACK: User = {
  id: 'user-admin-01',
  username: 'Võ Dương Phú',
  fullName: 'Võ Dương Phú (Tổng Quản Trị)',
  role: 'admin',
  password: '1234567',
  email: 'voduongphu@gmail.com',
  emailDigest: computeEmailAuthDigest('voduongphu@gmail.com'),
  phone: '0908 123 456',
  department: 'Ban Giám Đốc / QL Dự Án',
  isActive: true,
  createdAt: '2026-01-01T08:00:00Z',
  updatedAt: 1
};

export interface ServerStore {
  serverRevision: number;
  materialsRevision: number;
  users: User[];
  warehouses: Warehouse[];
  materials: MaterialItem[];
  inbound: InboundReceipt[];
  outbound: OutboundReceipt[];
  tombstones: TombstoneMap;
  osd: OsdReceipt[];
  osdRevision: number;
  activeSessions: Record<string, ActiveUserSession>;
  revokedTokens: Record<string, number>;
  sessionRevokedBefore: Record<string, number>;
  forceLogoutMeta: Record<string, { at: string; deviceLabel?: string }>;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: 'replaced' | 'disabled' | 'expired' | 'force_logout' | 'missing';
  session?: ActiveUserSession;
  replacedBy?: ActiveUserSession;
  forceLogoutBy?: { deviceLabel?: string; at?: string };
}

export interface SyncBackendOptions {
  isServerless?: boolean;
  onBroadcastRaw?: (payload: Record<string, unknown>) => void;
}

export interface SyncBackendInstance {
  app: Express;
  store: ServerStore;
  ensureInitialized: () => Promise<void>;
  validateSession: (params: {
    userKey?: string;
    username?: string;
    userId?: string;
    sessionToken?: string;
    deviceId?: string;
    deviceLabel?: string;
    loginAt?: string;
  }) => SessionValidationResult;
}

function getSessionIssuedAtMs(sess?: ActiveUserSession | null): number {
  if (!sess) return 0;
  if (Number(sess.issuedAtMs) > 0) return Number(sess.issuedAtMs);
  const parts = String(sess.sessionToken || '').split('.');
  if (parts.length >= 3) {
    const parsedTs = Number(parts[1]);
    if (Number.isFinite(parsedTs) && parsedTs > 0) return parsedTs;
  }
  const parsedLogin = sess.loginAt ? Date.parse(sess.loginAt) : 0;
  return Number.isFinite(parsedLogin) && parsedLogin > 0 ? parsedLogin : 0;
}

function createSignedSessionToken(userKey: string, deviceId: string, issuedAtMs: number): string {
  const nonce = crypto.randomUUID();
  const devB64 = Buffer.from(String(deviceId || ''), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(`${userKey}|${deviceId}|${nonce}|${issuedAtMs}`)
    .digest('hex')
    .slice(0, 24);
  return `${nonce}.${issuedAtMs}.${devB64}.${sig}`;
}

function verifySignedSessionToken(
  token: string,
  userKey: string,
  expectedDeviceId?: string
): { validSignature: boolean; issuedAtMs: number; deviceId: string } {
  const parts = String(token || '').split('.');
  if (parts.length === 4) {
    const [nonce, rawTs, devB64, sig] = parts;
    const issuedAtMs = Number(rawTs);
    if (!nonce || !Number.isFinite(issuedAtMs) || issuedAtMs <= 0 || !devB64 || !sig) {
      return { validSignature: false, issuedAtMs: 0, deviceId: '' };
    }
    let decodedDeviceId = '';
    try {
      decodedDeviceId = Buffer.from(devB64, 'base64url').toString('utf8');
    } catch {
      return { validSignature: false, issuedAtMs: 0, deviceId: '' };
    }
    if (!decodedDeviceId || (expectedDeviceId && expectedDeviceId !== decodedDeviceId)) {
      return { validSignature: false, issuedAtMs: 0, deviceId: '' };
    }
    const expected = crypto
      .createHmac('sha256', SESSION_HMAC_SECRET)
      .update(`${userKey}|${decodedDeviceId}|${nonce}|${issuedAtMs}`)
      .digest('hex')
      .slice(0, 24);
    if (sig.length !== expected.length) {
      return { validSignature: false, issuedAtMs: 0, deviceId: '' };
    }
    const match = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return {
      validSignature: match,
      issuedAtMs: match ? issuedAtMs : 0,
      deviceId: match ? decodedDeviceId : ''
    };
  }

  if (parts.length === 3 && expectedDeviceId) {
    const [nonce, rawTs, sig] = parts;
    const issuedAtMs = Number(rawTs);
    if (!nonce || !Number.isFinite(issuedAtMs) || issuedAtMs <= 0 || !sig) {
      return { validSignature: false, issuedAtMs: 0, deviceId: '' };
    }
    const expected = crypto
      .createHmac('sha256', SESSION_HMAC_SECRET)
      .update(`${userKey}|${expectedDeviceId}|${nonce}|${issuedAtMs}`)
      .digest('hex')
      .slice(0, 24);
    if (sig.length !== expected.length) {
      return { validSignature: false, issuedAtMs: 0, deviceId: '' };
    }
    const match = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return {
      validSignature: match,
      issuedAtMs: match ? issuedAtMs : 0,
      deviceId: match ? expectedDeviceId : ''
    };
  }

  return { validSignature: false, issuedAtMs: 0, deviceId: '' };
}

function resolveWritableDataDir(seedDir: string, forceServerless: boolean): string {
  if (forceServerless || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join('/tmp', 'vtp_sync_data');
  }
  try {
    fs.mkdirSync(seedDir, { recursive: true });
    fs.accessSync(seedDir, fs.constants.W_OK);
    return seedDir;
  } catch {
    return path.join('/tmp', 'vtp_sync_data');
  }
}

function codeToFileName(code: string): string {
  const hash = crypto.createHash('sha1').update(normKey(code)).digest('hex');
  return `${hash}.json`;
}

export function createSyncBackend(options: SyncBackendOptions = {}): SyncBackendInstance {
  const isServerless = Boolean(
    options.isServerless || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  );
  const seedDir = path.join(process.cwd(), '.sync_data');
  const dataDir = resolveWritableDataDir(seedDir, isServerless);
  const inboundDir = path.join(dataDir, 'inbound');
  const outboundDir = path.join(dataDir, 'outbound');
  const metaFile = path.join(dataDir, 'meta.json');
  const materialsFile = path.join(dataDir, 'materials.json');

  const store: ServerStore = {
    serverRevision: 1,
    materialsRevision: 1,
    users: [],
    warehouses: [],
    materials: [],
    inbound: [],
    outbound: [],
    tombstones: createEmptyTombstones(),
    osd: [],
    osdRevision: 1,
    activeSessions: {},
    revokedTokens: {},
    sessionRevokedBefore: {},
    forceLogoutMeta: {}
  };

  let cachedMaterialsDigestRev = -1;
  let cachedMaterialsDigestVal = '0:0:0:0';

  function getMaterialsDigestCached(): string {
    if (cachedMaterialsDigestRev === store.materialsRevision) {
      return cachedMaterialsDigestVal;
    }
    cachedMaterialsDigestVal = computeMaterialsDigest(store.materials);
    cachedMaterialsDigestRev = store.materialsRevision;
    return cachedMaterialsDigestVal;
  }

  function getRevokedBeforeMs(key: string, user?: User | null): number {
    return Math.max(
      Number(store.sessionRevokedBefore[key]) || 0,
      Number(user?.sessionRevokedAt) || 0
    );
  }

  function getLiveActiveSession(
    key: string,
    user: User | undefined,
    nowMs = Date.now()
  ): ActiveUserSession | undefined {
    const sess = store.activeSessions[key];
    if (!sess || !sess.sessionToken) return undefined;
    const issued = getSessionIssuedAtMs(sess);
    const revokedBefore = getRevokedBeforeMs(key, user);
    if (
      store.revokedTokens[sess.sessionToken] ||
      (revokedBefore > 0 && issued > 0 && issued <= revokedBefore) ||
      !isSessionHeartbeatFresh(nowMs, sess.lastSeenAt, ACTIVE_SESSION_TTL_MS)
    ) {
      delete store.activeSessions[key];
      return undefined;
    }
    return sess;
  }

  const broadcastRaw = (payload: Record<string, unknown>) => {
    options.onBroadcastRaw?.(payload);
  };

  const broadcastUpdate = (senderClientId?: string) => {
    broadcastRaw({
      type: 'sync:updated',
      serverRevision: store.serverRevision,
      materialsRevision: store.materialsRevision,
      senderClientId: senderClientId || ''
    });
  };

  async function loadDirIntoStore(dirPath: string, isSeedSource = false): Promise<void> {
    const dirMeta = path.join(dirPath, 'meta.json');
    const dirMaterials = path.join(dirPath, 'materials.json');
    const dirInbound = path.join(dirPath, 'inbound');
    const dirOutbound = path.join(dirPath, 'outbound');

    try {
      if (fs.existsSync(dirMeta)) {
        const raw = await fsp.readFile(dirMeta, 'utf8');
        const parsed = JSON.parse(raw);
        store.serverRevision = Math.max(store.serverRevision, Number(parsed.serverRevision) || 1);
        store.materialsRevision = Math.max(
          store.materialsRevision,
          Number(parsed.materialsRevision) || 1
        );
        store.osdRevision = Math.max(store.osdRevision || 1, Number(parsed.osdRevision) || 1);
        if (parsed.tombstones) {
          mergeTombstones(store.tombstones, parsed.tombstones);
        }
        if (Array.isArray(parsed.users)) {
          const sanitizedUsers: User[] = isSeedSource
            ? (parsed.users as User[]).map((u) => ({ ...u, sessionRevokedAt: undefined }))
            : (parsed.users as User[]);
          const mergedU = mergeUsersAdditive(store.users, sanitizedUsers, store.tombstones.users);
          store.users = mergedU.list;
          if (!isSeedSource) {
            for (const u of store.users) {
              const uKey = normUserKey(u.username);
              const uRev = Number(u.sessionRevokedAt) || 0;
              if (uKey && uRev > (store.sessionRevokedBefore[uKey] || 0)) {
                store.sessionRevokedBefore[uKey] = uRev;
              }
            }
          }
        }
        if (Array.isArray(parsed.warehouses)) {
          const mergedW = mergeWarehousesAdditive(
            store.warehouses,
            parsed.warehouses,
            store.tombstones.warehouses
          );
          store.warehouses = mergedW.list;
        }
        if (Array.isArray(parsed.osd)) {
          const mergedO = mergeOsdReceiptsAdditive(store.osd || [], parsed.osd, store.tombstones.osd, 'server');
          store.osd = mergedO.list;
        }
        if (!isSeedSource) {
          if (parsed.sessionRevokedBefore && typeof parsed.sessionRevokedBefore === 'object') {
            for (const [k, v] of Object.entries(
              parsed.sessionRevokedBefore as Record<string, number>
            )) {
              const num = Number(v) || 0;
              if (num > (store.sessionRevokedBefore[k] || 0)) {
                store.sessionRevokedBefore[k] = num;
              }
            }
          }
          if (parsed.forceLogoutMeta && typeof parsed.forceLogoutMeta === 'object') {
            Object.assign(store.forceLogoutMeta, parsed.forceLogoutMeta);
          }
          if (parsed.revokedTokens && typeof parsed.revokedTokens === 'object') {
            Object.assign(store.revokedTokens, parsed.revokedTokens);
          }
          if (parsed.activeSessions && typeof parsed.activeSessions === 'object') {
            const nowMs = Date.now();
            for (const [rawKey, sess] of Object.entries(
              parsed.activeSessions as Record<string, ActiveUserSession>
            )) {
              if (sess && sess.sessionToken && !store.revokedTokens[sess.sessionToken]) {
                const cleanKey = normUserKey(sess.username || sess.userKey || rawKey);
                const u = store.users.find((item) => normUserKey(item.username) === cleanKey);
                const revokedBefore = getRevokedBeforeMs(cleanKey, u);
                const sessIssued = getSessionIssuedAtMs(sess);
                if (
                  (revokedBefore > 0 && sessIssued > 0 && sessIssued <= revokedBefore) ||
                  !isSessionHeartbeatFresh(nowMs, sess.lastSeenAt, ACTIVE_SESSION_TTL_MS)
                ) {
                  continue;
                }
                const existing = store.activeSessions[cleanKey];
                if (!existing || sessIssued >= getSessionIssuedAtMs(existing)) {
                  store.activeSessions[cleanKey] = {
                    ...sess,
                    userKey: cleanKey,
                    issuedAtMs: sessIssued || undefined
                  };
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to load meta from ${dirMeta}:`, err);
    }

    try {
      if (fs.existsSync(dirMaterials)) {
        const raw = await fsp.readFile(dirMaterials, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mergedM = mergeMaterialsAdditive(
            store.materials,
            parsed,
            store.tombstones.materials
          );
          store.materials = mergedM.list;
        }
      }
    } catch (err) {
      console.error(`Failed to load materials from ${dirMaterials}:`, err);
    }

    try {
      if (fs.existsSync(dirInbound)) {
        const inFiles = await fsp.readdir(dirInbound);
        const loadedInbounds: InboundReceipt[] = [];
        for (const file of inFiles) {
          if (!file.endsWith('.json')) continue;
          try {
            const raw = await fsp.readFile(path.join(dirInbound, file), 'utf8');
            const rcp = JSON.parse(raw) as InboundReceipt;
            if (rcp && rcp.receiptCode) {
              loadedInbounds.push(rcp);
            }
          } catch {
            // skip corrupted file
          }
        }
        if (loadedInbounds.length > 0) {
          const mergedIn = mergeInboundReceiptsAdditive(
            store.inbound,
            loadedInbounds,
            store.tombstones.inbound
          );
          store.inbound = mergedIn.list;
        }
      }
    } catch (err) {
      console.error(`Failed to load inbound from ${dirInbound}:`, err);
    }

    try {
      if (fs.existsSync(dirOutbound)) {
        const outFiles = await fsp.readdir(dirOutbound);
        const loadedOutbounds: OutboundReceipt[] = [];
        for (const file of outFiles) {
          if (!file.endsWith('.json')) continue;
          try {
            const raw = await fsp.readFile(path.join(dirOutbound, file), 'utf8');
            const rcp = JSON.parse(raw) as OutboundReceipt;
            if (rcp && rcp.issueCode) {
              loadedOutbounds.push(rcp);
            }
          } catch {
            // skip corrupted file
          }
        }
        if (loadedOutbounds.length > 0) {
          const mergedOut = mergeOutboundReceiptsAdditive(
            store.outbound,
            loadedOutbounds,
            store.tombstones.outbound
          );
          store.outbound = mergedOut.list;
        }
      }
    } catch (err) {
      console.error(`Failed to load outbound from ${dirOutbound}:`, err);
    }
  }

  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      await fsp.mkdir(inboundDir, { recursive: true });
      await fsp.mkdir(outboundDir, { recursive: true });

      // Nếu chạy trên Serverless (Vercel /tmp), nạp dữ liệu gốc từ .sync_data trước (bỏ qua activeSessions tĩnh) rồi hợp nhất /tmp lên trên
      if (dataDir !== seedDir && fs.existsSync(seedDir)) {
        await loadDirIntoStore(seedDir, true);
      }
      await loadDirIntoStore(dataDir, false);

      if (store.users.length === 0) {
        store.users = [ROOT_ADMIN_FALLBACK];
      }
    })();
    return initPromise;
  }

  let metaSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let materialsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const dirtyInboundCodes = new Set<string>();
  const dirtyOutboundCodes = new Set<string>();
  let receiptsSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function pruneRevokedTokens(): void {
    const keys = Object.keys(store.revokedTokens);
    if (keys.length <= 500) return;
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    for (const k of keys) {
      if ((store.revokedTokens[k] || 0) < cutoff) {
        delete store.revokedTokens[k];
      }
    }
  }

  async function writeMetaToDiskNow(): Promise<void> {
    try {
      pruneRevokedTokens();
      const payload = JSON.stringify({
        serverRevision: store.serverRevision,
        materialsRevision: store.materialsRevision,
        osdRevision: store.osdRevision || 1,
        users: store.users,
        warehouses: store.warehouses,
        tombstones: store.tombstones,
        osd: store.osd,
        activeSessions: store.activeSessions,
        revokedTokens: store.revokedTokens,
        sessionRevokedBefore: store.sessionRevokedBefore,
        forceLogoutMeta: store.forceLogoutMeta
      });
      await fsp.writeFile(metaFile, payload, 'utf8');
    } catch (err) {
      console.error('Error saving meta.json:', err);
    }
  }

  function scheduleSaveMeta(delayMs = 120): void {
    if (isServerless) {
      void writeMetaToDiskNow();
      return;
    }
    if (metaSaveTimer) clearTimeout(metaSaveTimer);
    metaSaveTimer = setTimeout(() => {
      void writeMetaToDiskNow();
    }, delayMs);
  }

  async function writeMaterialsToDiskNow(): Promise<void> {
    try {
      await fsp.writeFile(materialsFile, JSON.stringify(store.materials), 'utf8');
    } catch (err) {
      console.error('Error saving materials.json:', err);
    }
  }

  function scheduleSaveMaterials(): void {
    if (isServerless) {
      void writeMaterialsToDiskNow();
      return;
    }
    if (materialsSaveTimer) clearTimeout(materialsSaveTimer);
    materialsSaveTimer = setTimeout(() => {
      void writeMaterialsToDiskNow();
    }, 250);
  }

  async function flushReceiptsToDiskNow(inCodes: string[], outCodes: string[]): Promise<void> {
    if (inCodes.length > 0) {
      const inMap = new Map<string, InboundReceipt>();
      for (let i = 0; i < store.inbound.length; i++) {
        inMap.set(normKey(store.inbound[i].receiptCode || store.inbound[i].id), store.inbound[i]);
      }
      for (const code of inCodes) {
        const filePath = path.join(inboundDir, codeToFileName(code));
        const rcp = inMap.get(code);
        try {
          if (rcp) {
            await fsp.writeFile(filePath, JSON.stringify(rcp), 'utf8');
          } else if (fs.existsSync(filePath)) {
            await fsp.unlink(filePath);
          }
        } catch (err) {
          console.error('Error saving inbound receipt file:', err);
        }
      }
    }

    if (outCodes.length > 0) {
      const outMap = new Map<string, OutboundReceipt>();
      for (let i = 0; i < store.outbound.length; i++) {
        outMap.set(normKey(store.outbound[i].issueCode || store.outbound[i].id), store.outbound[i]);
      }
      for (const code of outCodes) {
        const filePath = path.join(outboundDir, codeToFileName(code));
        const rcp = outMap.get(code);
        try {
          if (rcp) {
            await fsp.writeFile(filePath, JSON.stringify(rcp), 'utf8');
          } else if (fs.existsSync(filePath)) {
            await fsp.unlink(filePath);
          }
        } catch (err) {
          console.error('Error saving outbound receipt file:', err);
        }
      }
    }
  }

  function scheduleSaveReceipts(type: 'inbound' | 'outbound', codes: string[]): void {
    if (isServerless) {
      const normalized = codes.map((c) => normKey(c));
      if (type === 'inbound') {
        void flushReceiptsToDiskNow(normalized, []);
      } else {
        void flushReceiptsToDiskNow([], normalized);
      }
      return;
    }

    const targetSet = type === 'inbound' ? dirtyInboundCodes : dirtyOutboundCodes;
    for (let i = 0; i < codes.length; i++) {
      targetSet.add(normKey(codes[i]));
    }
    if (receiptsSaveTimer) clearTimeout(receiptsSaveTimer);
    receiptsSaveTimer = setTimeout(() => {
      const inCodes = Array.from(dirtyInboundCodes);
      const outCodes = Array.from(dirtyOutboundCodes);
      dirtyInboundCodes.clear();
      dirtyOutboundCodes.clear();
      void flushReceiptsToDiskNow(inCodes, outCodes);
    }, 200);
  }

  function validateSession(params: {
    userKey?: string;
    username?: string;
    userId?: string;
    sessionToken?: string;
    deviceId?: string;
    deviceLabel?: string;
    loginAt?: string;
  }): SessionValidationResult {
    const rawKey = normUserKey(String(params.userKey || params.username || ''));
    const token = String(params.sessionToken || '').trim();
    if (!rawKey || !token) {
      return { valid: false, reason: 'missing' };
    }

    const user = store.users.find(
      (u) =>
        normUserKey(u.username) === rawKey ||
        canonicalUserSessionKey(u) === rawKey ||
        (params.userId && u.id === params.userId)
    );
    const key = user ? canonicalUserSessionKey(user) : rawKey;
    const deletedInTombstones = isRecordDeleted(
      store.tombstones.users,
      [params.userId || '', key, rawKey],
      user?.updatedAt
    );
    if ((user && !user.isActive) || deletedInTombstones) {
      if (store.activeSessions[key]) {
        delete store.activeSessions[key];
        scheduleSaveMeta();
      }
      if (store.activeSessions[rawKey]) {
        delete store.activeSessions[rawKey];
        scheduleSaveMeta();
      }
      return { valid: false, reason: 'disabled' };
    }

    const nowMs = Date.now();
    const revokedBefore = Math.max(getRevokedBeforeMs(key, user), getRevokedBeforeMs(rawKey, user));
    let active: ActiveUserSession | undefined = store.activeSessions[key] || store.activeSessions[rawKey];

    if (active) {
      const activeIssued = getSessionIssuedAtMs(active);
      if (
        store.revokedTokens[active.sessionToken] ||
        (revokedBefore > 0 && activeIssued > 0 && activeIssued <= revokedBefore)
      ) {
        delete store.activeSessions[key];
        active = undefined;
      }
    }

    if (active && active.sessionToken === token) {
      active.lastSeenAt = nowMs;
      return { valid: true, session: active };
    }

    const sigCheck = verifySignedSessionToken(token, key, params.deviceId);

    if (store.revokedTokens[token]) {
      if (active && active.sessionToken !== token) {
        return { valid: false, reason: 'replaced', replacedBy: active };
      }
      if (store.forceLogoutMeta[key]) {
        return {
          valid: false,
          reason: 'force_logout',
          forceLogoutBy: store.forceLogoutMeta[key]
        };
      }
      return { valid: false, reason: 'expired' };
    }

    if (!sigCheck.validSignature) {
      if (active) {
        return { valid: false, reason: 'replaced', replacedBy: active };
      }
      return { valid: false, reason: user ? 'expired' : 'missing' };
    }

    const tokenIssuedAtMs = sigCheck.issuedAtMs;

    if (revokedBefore > 0 && tokenIssuedAtMs <= revokedBefore) {
      if (active && getSessionIssuedAtMs(active) > tokenIssuedAtMs) {
        return { valid: false, reason: 'replaced', replacedBy: active };
      }
      if (store.forceLogoutMeta[key]) {
        return {
          valid: false,
          reason: 'force_logout',
          forceLogoutBy: store.forceLogoutMeta[key]
        };
      }
      return { valid: false, reason: 'expired' };
    }

    const activeIssuedAtMs = getSessionIssuedAtMs(active);
    if (!active || tokenIssuedAtMs > activeIssuedAtMs) {
      // Phiên gửi lên có chữ ký HMAC hợp lệ và mới hơn phiên cũ đang lưu trên instance này -> Nâng cấp phiên ngay cả khi instance mới khởi tạo chưa đồng bộ kịp danh sách users!
      if (active && active.sessionToken && active.sessionToken !== token) {
        store.revokedTokens[active.sessionToken] = tokenIssuedAtMs;
      }
      const upgraded: ActiveUserSession = {
        userId: user?.id || params.userId || key,
        username: user?.username || params.username || key,
        userKey: key,
        sessionToken: token,
        issuedAtMs: tokenIssuedAtMs,
        deviceId: params.deviceId || sigCheck.deviceId || 'dev-recovered',
        deviceLabel: params.deviceLabel || 'Thiết bị hiện tại',
        loginAt: params.loginAt || new Date(tokenIssuedAtMs).toISOString(),
        lastSeenAt: nowMs
      };
      store.activeSessions[key] = upgraded;
      scheduleSaveMeta();
      return { valid: true, session: upgraded };
    }

    return {
      valid: false,
      reason: 'replaced',
      replacedBy: active
    };
  }

  const app = express();
  const jsonParser = express.json({ limit: '50mb' });

  // Hỗ trợ chuẩn hóa đường dẫn khi chạy sau Vercel Rewrite (/api/index?__api_path=...)
  app.use((req, _res, next) => {
    const rawUrl = req.url || '/';
    const [pathname, rawQuery = ''] = rawUrl.split('?');
    if (pathname === '/api/index' || pathname === '/api/index.js') {
      const params = new URLSearchParams(rawQuery);
      const rewrittenPath = params.get('__api_path') || '';
      params.delete('__api_path');
      const qs = params.toString();
      req.url = `/api/${rewrittenPath.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
    }
    next();
  });

  // Tương thích an toàn với cả Express thuần và môi trường Serverless đã parse sẵn req.body
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        next();
        return;
      }
      if (typeof req.body === 'string' && req.body.length > 0) {
        try {
          req.body = JSON.parse(req.body);
          next();
          return;
        } catch {
          // fall through
        }
      }
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        try {
          req.body = JSON.parse(req.body.toString('utf8'));
          next();
          return;
        } catch {
          // fall through
        }
      }
    }
    jsonParser(req, res, next);
  });

  // Đảm bảo dữ liệu đã được nạp trước khi xử lý mọi API
  app.use('/api', async (_req, res, next) => {
    await ensureInitialized();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Auth-Invalidated, X-Auth-Replaced-By, X-Auth-Token-Checked'
    );
    next();
  });

  // Kiểm tra hiệu lực phiên đơn điệu trên mọi request đồng bộ (/api/sync/*) có gửi kèm session header
  app.use('/api/sync', (req, res, next) => {
    const rawUserKey = req.headers['x-auth-user-key'];
    const rawToken = req.headers['x-auth-session-token'];
    const rawDeviceId = req.headers['x-auth-device-id'];
    const rawDeviceLabel = req.headers['x-auth-device-label'];

    const key = normUserKey(typeof rawUserKey === 'string' ? decodeURIComponent(rawUserKey) : '');
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    const deviceId = typeof rawDeviceId === 'string' ? decodeURIComponent(rawDeviceId) : undefined;
    const deviceLabel =
      typeof rawDeviceLabel === 'string' ? decodeURIComponent(rawDeviceLabel) : undefined;

    if (!key || !token) {
      next();
      return;
    }

    const isDataSync =
      req.method === 'GET' ||
      req.path === '/osd' ||
      req.path.startsWith('/osd') ||
      req.path === '/receipts-batch-pull' ||
      req.path === '/receipts-chunk-push' ||
      req.path === '/meta';

    const check = validateSession({
      userKey: key,
      sessionToken: token,
      deviceId,
      deviceLabel
    });

    if (!check.valid) {
      const reason = check.reason || 'expired';
      res.setHeader('X-Auth-Invalidated', reason);
      res.setHeader('X-Auth-Token-Checked', token);
      if (check.replacedBy) {
        res.setHeader('X-Auth-Replaced-By', encodeURIComponent(JSON.stringify(check.replacedBy)));
      } else if (check.forceLogoutBy) {
        res.setHeader(
          'X-Auth-Replaced-By',
          encodeURIComponent(
            JSON.stringify({
              deviceLabel: check.forceLogoutBy.deviceLabel,
              loginAt: check.forceLogoutBy.at
            })
          )
        );
      }
      if (!isDataSync) {
        res.status(401).json({
          error: 'Session invalid',
          reason,
          replacedBy: check.replacedBy
        });
        return;
      }
      next();
      return;
    }

    next();
  });

  // ==========================================================================
  // AUTH & SINGLE-DEVICE SESSION ENFORCEMENT
  // ==========================================================================
  app.post('/api/auth/login', async (req, res) => {
    const {
      username,
      password,
      deviceId,
      deviceLabel,
      localUsers
    } = req.body || {};
    let forceLogoutOtherDevice = Boolean(req.body?.forceLogoutOtherDevice);
    const trimmedUser = String(username || '').trim();
    const passStr = String(password ?? '');

    if (!trimmedUser || !passStr) {
      res.json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên người sử dụng và mật khẩu.'
      });
      return;
    }

    if (Array.isArray(localUsers) && localUsers.length > 0) {
      const mergedU = mergeUsersAdditive(store.users, localUsers, store.tombstones.users);
      if (mergedU.changed) {
        store.users = mergedU.list;
        store.serverRevision++;
      }
    }

    const matchedCandidate = findMatchingUser(store.users, trimmedUser);
    const matchedIdx = matchedCandidate
      ? store.users.findIndex(
          (u) =>
            u.id === matchedCandidate.id ||
            normUserKey(u.username) === normUserKey(matchedCandidate.username)
        )
      : -1;

    if (matchedIdx === -1) {
      res.json({
        success: false,
        message: `Tài khoản "${trimmedUser}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại!`
      });
      return;
    }

    const user = store.users[matchedIdx];
    if (!user.isActive) {
      res.json({
        success: false,
        message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt. Vui lòng liên hệ Admin.'
      });
      return;
    }

    if (!isPasswordMatch(user.password, passStr)) {
      res.json({
        success: false,
        message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
      });
      return;
    }

    const nowMs = Date.now();
    const userKey = canonicalUserSessionKey(user);
    const cleanDeviceId = String(deviceId || `dev-${nowMs}`);
    const cleanDeviceLabel = String(deviceLabel || 'Thiết bị khác');

    const isForceLogout = Boolean(forceLogoutOtherDevice);
    const liveOtherSession = getLiveActiveSession(userKey, user, nowMs);
    if (
      liveOtherSession &&
      !isForceLogout &&
      (liveOtherSession.deviceId !== cleanDeviceId || liveOtherSession.sessionToken)
    ) {
      res.json({
        success: false,
        conflict: true,
        message: `Tài khoản "${user.username}" đang đăng nhập trên ${liveOtherSession.deviceLabel || 'thiết bị khác'}. Không cho phép một tài khoản đăng nhập cùng lúc trên 2 thiết bị. Bạn có muốn đăng xuất thiết bị kia từ xa để đăng nhập tại đây không?`,
        activeSession: {
          userId: user.id,
          username: user.username,
          userKey,
          sessionToken: liveOtherSession.sessionToken,
          deviceId: liveOtherSession.deviceId,
          deviceLabel: liveOtherSession.deviceLabel || 'Thiết bị khác',
          loginAt: liveOtherSession.loginAt,
          lastSeenAt: liveOtherSession.lastSeenAt
        }
      });
      return;
    }

    const prevSession = store.activeSessions[userKey];
    const prevIssuedAt = getSessionIssuedAtMs(prevSession);
    const prevRevoked = getRevokedBeforeMs(userKey, user);
    const issuedAtMs = Math.max(nowMs, prevIssuedAt + 2, prevRevoked + 2);
    const forceRevokedAt = issuedAtMs - 1;
    const nowIso = new Date(nowMs).toISOString();
    const sessionToken = createSignedSessionToken(userKey, cleanDeviceId, issuedAtMs);

    if (prevSession && prevSession.sessionToken) {
      store.revokedTokens[prevSession.sessionToken] = issuedAtMs;
    }
    if (isForceLogout || (liveOtherSession && liveOtherSession.deviceId !== cleanDeviceId)) {
      store.sessionRevokedBefore[userKey] = forceRevokedAt;
      store.forceLogoutMeta[userKey] = { at: nowIso, deviceLabel: cleanDeviceLabel };
    } else {
      delete store.forceLogoutMeta[userKey];
    }

    const replacedPrevious =
      liveOtherSession && liveOtherSession.deviceId !== cleanDeviceId
        ? { ...liveOtherSession }
        : undefined;

    const updatedUser: User = {
      ...user,
      lastLogin: nowIso,
      sessionRevokedAt: forceLogoutOtherDevice
        ? Math.max(Number(user.sessionRevokedAt) || 0, forceRevokedAt)
        : user.sessionRevokedAt,
      updatedAt: Math.max(nowMs, Number(user.updatedAt || 0) + 1)
    };
    store.users[matchedIdx] = updatedUser;

    const session: ActiveUserSession = {
      userId: updatedUser.id,
      username: updatedUser.username,
      userKey,
      sessionToken,
      issuedAtMs,
      deviceId: cleanDeviceId,
      deviceLabel: cleanDeviceLabel,
      loginAt: nowIso,
      lastSeenAt: nowMs
    };

    store.activeSessions[userKey] = session;
    store.serverRevision++;
    await writeMetaToDiskNow();

    broadcastRaw({
      type: 'auth:session_replaced',
      userKey,
      userId: updatedUser.id,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      activeSessionToken: sessionToken,
      issuedAtMs,
      deviceId: cleanDeviceId,
      deviceLabel: cleanDeviceLabel,
      loginAt: nowIso
    });
    broadcastUpdate();

    res.json({
      success: true,
      message: replacedPrevious
        ? `Đã đăng xuất phiên trên "${replacedPrevious.deviceLabel || 'thiết bị kia'}" và đăng nhập thành công trên thiết bị hiện tại!`
        : 'Đăng nhập thành công!',
      user: updatedUser,
      session,
      replacedSession: replacedPrevious,
      users: store.users
    });
  });

  app.post('/api/auth/google-login', async (req, res) => {
    const {
      email,
      displayName,
      uid,
      deviceId,
      deviceLabel,
      localUsers
    } = req.body || {};
    let forceLogoutOtherDevice = Boolean(req.body?.forceLogoutOtherDevice);

    const emailLower = String(email || '').trim().toLowerCase();
    if (!emailLower || !emailLower.includes('@')) {
      res.json({
        success: false,
        message: 'Không nhận được địa chỉ email hợp lệ từ tài khoản Google. Vui lòng thử lại.'
      });
      return;
    }

    if (Array.isArray(localUsers) && localUsers.length > 0) {
      const mergedU = mergeUsersAdditive(store.users, localUsers, store.tombstones.users);
      if (mergedU.changed) {
        store.users = mergedU.list;
        store.serverRevision++;
      }
    }

    const nowMs = Date.now();
    const resolved = resolveGoogleUserRecord(store.users, {
      email: emailLower,
      displayName: typeof displayName === 'string' ? displayName : null,
      uid: typeof uid === 'string' ? uid : null,
      nowMs
    });

    if (!resolved.allowed) {
      res.json({
        success: false,
        message:
          resolved.message ||
          'Tài khoản Google này hiện đang bị khóa hoặc ngừng kích hoạt trên hệ thống.'
      });
      return;
    }

    let user = resolved.user;
    const uKeyCandidate = normUserKey(user.username);
    const emDigest = user.emailDigest || computeEmailAuthDigest(emailLower);
    const prevTombTs = Math.max(
      Number(store.tombstones.users[uKeyCandidate]) || 0,
      Number(store.tombstones.users[user.id]) || 0,
      emDigest ? Number(store.tombstones.users[emDigest]) || 0 : 0
    );
    if (prevTombTs >= (Number(user.updatedAt) || 0)) {
      user = {
        ...user,
        updatedAt: prevTombTs + 1
      };
    }

    const mergedSingle = mergeUsersAdditive(store.users, [user], store.tombstones.users);
    if (mergedSingle.changed) {
      store.users = mergedSingle.list;
    }

    let matchedIdx = store.users.findIndex(
      (u) =>
        (emDigest && u.emailDigest === emDigest) ||
        u.id === user.id ||
        normUserKey(u.username) === normUserKey(user.username) ||
        (isBootstrappedAdminUser(user) && isBootstrappedAdminUser(u))
    );
    if (matchedIdx === -1) {
      store.users.push(user);
      matchedIdx = store.users.length - 1;
    }
    user = store.users[matchedIdx];

    const userKey = canonicalUserSessionKey(user);
    const cleanDeviceId = String(deviceId || `dev-${nowMs}`);
    const cleanDeviceLabel = String(deviceLabel || 'Thiết bị Web');

    const isForceLogout = Boolean(forceLogoutOtherDevice);
    const liveOtherSession = getLiveActiveSession(userKey, user, nowMs);
    if (
      liveOtherSession &&
      !isForceLogout &&
      (liveOtherSession.deviceId !== cleanDeviceId || liveOtherSession.sessionToken)
    ) {
      res.json({
        success: false,
        conflict: true,
        message: `Tài khoản Google "${user.username}" (${user.email}) đang đăng nhập trên ${liveOtherSession.deviceLabel || 'thiết bị khác'}. Không cho phép một tài khoản đăng nhập cùng lúc trên 2 thiết bị. Bạn có muốn đăng xuất thiết bị kia từ xa để đăng nhập tại đây không?`,
        activeSession: {
          userId: user.id,
          username: user.username,
          userKey,
          sessionToken: liveOtherSession.sessionToken,
          deviceId: liveOtherSession.deviceId,
          deviceLabel: liveOtherSession.deviceLabel || 'Thiết bị khác',
          loginAt: liveOtherSession.loginAt,
          lastSeenAt: liveOtherSession.lastSeenAt
        }
      });
      return;
    }

    const prevSession = store.activeSessions[userKey];
    const prevIssuedAt = getSessionIssuedAtMs(prevSession);
    const prevRevoked = getRevokedBeforeMs(userKey, user);
    const issuedAtMs = Math.max(nowMs, prevIssuedAt + 2, prevRevoked + 2);
    const forceRevokedAt = issuedAtMs - 1;
    const nowIso = new Date(nowMs).toISOString();
    const sessionToken = createSignedSessionToken(userKey, cleanDeviceId, issuedAtMs);

    if (prevSession && prevSession.sessionToken) {
      store.revokedTokens[prevSession.sessionToken] = issuedAtMs;
    }
    if (isForceLogout || (liveOtherSession && liveOtherSession.deviceId !== cleanDeviceId)) {
      store.sessionRevokedBefore[userKey] = forceRevokedAt;
      store.forceLogoutMeta[userKey] = { at: nowIso, deviceLabel: cleanDeviceLabel };
    } else {
      delete store.forceLogoutMeta[userKey];
    }

    const replacedPrevious =
      liveOtherSession && liveOtherSession.deviceId !== cleanDeviceId
        ? { ...liveOtherSession }
        : undefined;

    const updatedUser: User = {
      ...user,
      lastLogin: nowIso,
      sessionRevokedAt: forceLogoutOtherDevice
        ? Math.max(Number(user.sessionRevokedAt) || 0, forceRevokedAt)
        : user.sessionRevokedAt,
      updatedAt: Math.max(nowMs, Number(user.updatedAt || 0) + 1)
    };
    store.users[matchedIdx] = updatedUser;

    const session: ActiveUserSession = {
      userId: updatedUser.id,
      username: updatedUser.username,
      userKey,
      sessionToken,
      issuedAtMs,
      deviceId: cleanDeviceId,
      deviceLabel: cleanDeviceLabel,
      loginAt: nowIso,
      lastSeenAt: nowMs
    };

    store.activeSessions[userKey] = session;
    store.serverRevision++;
    await writeMetaToDiskNow();

    broadcastRaw({
      type: 'auth:session_replaced',
      userKey,
      userId: updatedUser.id,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      activeSessionToken: sessionToken,
      issuedAtMs,
      deviceId: cleanDeviceId,
      deviceLabel: cleanDeviceLabel,
      loginAt: nowIso
    });
    broadcastUpdate();

    res.json({
      success: true,
      message: replacedPrevious
        ? `Đã đăng xuất phiên trên "${replacedPrevious.deviceLabel || 'thiết bị kia'}" và đăng nhập Google thành công!`
        : `Đăng nhập thành công với ${emailLower}!`,
      user: updatedUser,
      session,
      replacedSession: replacedPrevious,
      users: store.users
    });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const { userKey, username, sessionToken, deviceId } = req.body || {};
    const key = normUserKey(String(userKey || username || ''));
    const token = String(sessionToken || '').trim();
    const nowMs = Date.now();

    if (token) {
      const sigCheck = key ? verifySignedSessionToken(token, key, deviceId) : null;
      const tokenIssuedAtMs = sigCheck?.validSignature ? sigCheck.issuedAtMs : 0;
      store.revokedTokens[token] = Math.max(nowMs, tokenIssuedAtMs || 1);
    }

    if (key) {
      const currentActive = store.activeSessions[key];
      const activeMatchesToken = Boolean(
        currentActive &&
          ((token && currentActive.sessionToken === token) ||
            (!token && deviceId && currentActive.deviceId === String(deviceId)))
      );

      // Chỉ giải phóng đúng phiên vừa đăng xuất; tuyệt đối không xóa phiên mới nếu người dùng vừa đăng nhập lại ngay lập tức
      // và không nâng user.sessionRevokedAt khi thoát chủ động để tránh xung đột lệch đồng hồ giữa các thiết bị
      if (activeMatchesToken) {
        delete store.activeSessions[key];
      }

      store.serverRevision++;
      await writeMetaToDiskNow();
      if (token) {
        broadcastRaw({
          type: 'auth:session_expired',
          userKey: key,
          expiredSessionToken: token
        });
      }
      broadcastUpdate();
    }

    res.json({ ok: true });
  });

  app.post('/api/auth/force-logout', async (req, res) => {
    const {
      keepCurrentSession,
      googleEmail,
      username,
      password,
      userKey: rawUserKey,
      userId,
      sessionToken,
      deviceId,
      deviceLabel,
      localUsers
    } = req.body || {};

    const nowMs = Date.now();
    const cleanDeviceId = String(deviceId || `dev-${nowMs}`);
    const cleanDeviceLabel = String(deviceLabel || 'Thiết bị khác');

    if (keepCurrentSession) {
      const check = validateSession({
        userKey: rawUserKey,
        username,
        userId,
        sessionToken,
        deviceId: cleanDeviceId,
        deviceLabel: cleanDeviceLabel
      });

      if (!check.valid || !check.session) {
        res.json({
          success: false,
          message: 'Phiên đăng nhập hiện tại không còn hiệu lực. Vui lòng đăng nhập lại.'
        });
        return;
      }

      const key = check.session.userKey;
      const userIdx = store.users.findIndex((u) => normUserKey(u.username) === key);
      const user = userIdx >= 0 ? store.users[userIdx] : undefined;
      const currIssuedAt = getSessionIssuedAtMs(check.session);
      const prevRevoked = getRevokedBeforeMs(key, user);
      const issuedAtMs = Math.max(nowMs, currIssuedAt + 2, prevRevoked + 2);
      const revokedAt = issuedAtMs - 1;
      const nowIso = new Date(issuedAtMs).toISOString();
      const newSessionToken = createSignedSessionToken(key, cleanDeviceId, issuedAtMs);

      store.revokedTokens[check.session.sessionToken] = issuedAtMs;
      store.sessionRevokedBefore[key] = revokedAt;
      store.forceLogoutMeta[key] = { at: nowIso, deviceLabel: cleanDeviceLabel };

      let updatedUser: User | undefined;
      if (user && userIdx >= 0) {
        updatedUser = {
          ...user,
          sessionRevokedAt: revokedAt,
          updatedAt: Math.max(issuedAtMs, Number(user.updatedAt || 0) + 1)
        };
        store.users[userIdx] = updatedUser;
      }

      const newSession: ActiveUserSession = {
        userId: updatedUser?.id || check.session.userId,
        username: updatedUser?.username || check.session.username,
        userKey: key,
        sessionToken: newSessionToken,
        issuedAtMs,
        deviceId: cleanDeviceId,
        deviceLabel: cleanDeviceLabel,
        loginAt: check.session.loginAt || nowIso,
        lastSeenAt: nowMs
      };
      store.activeSessions[key] = newSession;
      store.serverRevision++;
      await writeMetaToDiskNow();

      broadcastRaw({
        type: 'auth:session_force_logout',
        userKey: key,
        revokedBeforeMs: revokedAt,
        exceptSessionToken: newSessionToken,
        deviceLabel: cleanDeviceLabel,
        at: nowIso
      });
      broadcastUpdate();

      res.json({
        success: true,
        message: 'Đã gửi yêu cầu đăng xuất thành công tới mọi thiết bị khác!',
        user: updatedUser,
        session: newSession,
        users: store.users
      });
      return;
    }

    const cleanGoogleEmail = String(googleEmail || '').trim().toLowerCase();
    const trimmedUser = String(username || '').trim();
    const passStr = String(password ?? '');

    if (!cleanGoogleEmail && (!trimmedUser || !passStr)) {
      res.json({
        success: false,
        message: 'Vui lòng đăng nhập bằng tài khoản Google để xác thực yêu cầu đăng xuất thiết bị kia.'
      });
      return;
    }

    if (Array.isArray(localUsers) && localUsers.length > 0) {
      const mergedU = mergeUsersAdditive(store.users, localUsers, store.tombstones.users);
      if (mergedU.changed) {
        store.users = mergedU.list;
        store.serverRevision++;
      }
    }

    let matchedIdx = -1;
    if (cleanGoogleEmail && cleanGoogleEmail.includes('@')) {
      const emDigest = computeEmailAuthDigest(cleanGoogleEmail);
      matchedIdx = store.users.findIndex(
        (u) =>
          (u.email || '').trim().toLowerCase() === cleanGoogleEmail ||
          (emDigest && (u.emailDigest === emDigest || computeEmailAuthDigest(u.email) === emDigest)) ||
          (cleanGoogleEmail === 'voduongphu@gmail.com' && isBootstrappedAdminUser(u))
      );
    } else {
      const matchedCandidate = findMatchingUser(store.users, trimmedUser);
      matchedIdx = matchedCandidate
        ? store.users.findIndex(
            (u) =>
              u.id === matchedCandidate.id ||
              normUserKey(u.username) === normUserKey(matchedCandidate.username)
          )
        : -1;
    }

    if (matchedIdx === -1) {
      res.json({
        success: false,
        message: 'Không tìm thấy phiên hoạt động của tài khoản này trên thiết bị khác.'
      });
      return;
    }

    const user = store.users[matchedIdx];
    if (!user.isActive) {
      res.json({
        success: false,
        message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt.'
      });
      return;
    }

    if (!cleanGoogleEmail && !isPasswordMatch(user.password, passStr)) {
      res.json({
        success: false,
        message: 'Xác thực không hợp lệ. Không thể gửi yêu cầu đăng xuất thiết bị kia.'
      });
      return;
    }

    const userKey = normUserKey(user.username);
    const prevActive = getLiveActiveSession(userKey, user, nowMs) || store.activeSessions[userKey];
    const prevIssuedAt = getSessionIssuedAtMs(prevActive);
    const prevRevoked = getRevokedBeforeMs(userKey, user);
    const revokedAt = Math.max(nowMs, prevIssuedAt, prevRevoked + 1);
    const nowIso = new Date(revokedAt).toISOString();

    if (prevActive && prevActive.sessionToken) {
      store.revokedTokens[prevActive.sessionToken] = revokedAt;
    }
    delete store.activeSessions[userKey];
    store.sessionRevokedBefore[userKey] = revokedAt;
    store.forceLogoutMeta[userKey] = { at: nowIso, deviceLabel: cleanDeviceLabel };

    const updatedUser: User = {
      ...user,
      sessionRevokedAt: revokedAt,
      updatedAt: Math.max(revokedAt, Number(user.updatedAt || 0) + 1)
    };
    store.users[matchedIdx] = updatedUser;
    store.serverRevision++;
    await writeMetaToDiskNow();

    broadcastRaw({
      type: 'auth:session_force_logout',
      userKey,
      revokedBeforeMs: revokedAt,
      deviceLabel: cleanDeviceLabel,
      at: nowIso
    });
    broadcastUpdate();

    const targetLabel = prevActive?.deviceLabel;
    res.json({
      success: true,
      hadActiveSession: Boolean(prevActive),
      loggedOutDeviceLabel: targetLabel,
      users: store.users,
      message: targetLabel
        ? `Đã yêu cầu đăng xuất thành công phiên trên "${targetLabel}". Bạn có thể nhấn Đăng nhập ngay bây giờ!`
        : 'Đã thu hồi toàn bộ phiên đăng nhập trên các thiết bị khác. Bạn có thể nhấn Đăng nhập ngay bây giờ!'
    });
  });

  app.post('/api/auth/verify-session', async (req, res) => {
    const { userId, username, userKey, sessionToken, deviceId, deviceLabel, loginAt } =
      req.body || {};
    const check = validateSession({
      userId: userId ? String(userId) : undefined,
      username: username ? String(username) : undefined,
      userKey: userKey ? String(userKey) : undefined,
      sessionToken: sessionToken ? String(sessionToken) : undefined,
      deviceId: deviceId ? String(deviceId) : undefined,
      deviceLabel: deviceLabel ? String(deviceLabel) : undefined,
      loginAt: loginAt ? String(loginAt) : undefined
    });

    if (!check.valid) {
      res.json({
        valid: false,
        reason: check.reason || 'expired',
        replacedBy: check.replacedBy,
        forceLogoutBy: check.forceLogoutBy
      });
      return;
    }

    res.json({
      valid: true,
      session: check.session
    });
  });

  // ==========================================================================
  // DATA SYNCHRONIZATION ENDPOINTS (100% ADDITIVE MERGE, 100k+ ROWS READY)
  // ==========================================================================
  app.get('/api/sync/manifest', (_req, res) => {
    const nowMs = Date.now();
    for (const sKey of Object.keys(store.activeSessions)) {
      const u = store.users.find((item) => normUserKey(item.username) === sKey);
      getLiveActiveSession(sKey, u, nowMs);
    }

    const inboundManifest = store.inbound.map((r) => ({
      code: normKey(r.receiptCode || r.id),
      receiptCode: r.receiptCode,
      id: r.id,
      itemCount: r.items.length,
      updatedAt: r.updatedAt || 0,
      itemsReplacedAt: r.itemsReplacedAt || 0,
      digest: computeInboundReceiptDigest(r)
    }));

    const outboundManifest = store.outbound.map((r) => ({
      code: normKey(r.issueCode || r.id),
      issueCode: r.issueCode,
      id: r.id,
      itemCount: r.items.length,
      updatedAt: r.updatedAt || 0,
      itemsReplacedAt: r.itemsReplacedAt || 0,
      digest: computeOutboundReceiptDigest(r)
    }));

    res.json({
      serverRevision: store.serverRevision,
      materialsRevision: store.materialsRevision,
      materialsCount: store.materials.length,
      materialsDigest: getMaterialsDigestCached(),
      metaDigest: computeMetaDigest(store.users, store.warehouses, store.tombstones, store.osd || []),
      activeSessions: store.activeSessions,
      users: store.users,
      warehouses: store.warehouses,
      tombstones: store.tombstones,
      osd: store.osd || [],
      osdRevision: store.osdRevision || 1,
      inboundManifest,
      outboundManifest
    });
  });

  app.post('/api/sync/meta', (req, res) => {
    const { clientId, users, warehouses, tombstones } = req.body || {};
    let anyChanged = false;

    if (tombstones && mergeTombstones(store.tombstones, tombstones)) {
      anyChanged = true;
      const cleanIn = mergeInboundReceiptsAdditive(store.inbound, [], store.tombstones.inbound);
      if (cleanIn.changed) {
        const prevCodes = store.inbound.map((r) => normKey(r.receiptCode || r.id));
        store.inbound = cleanIn.list;
        scheduleSaveReceipts('inbound', prevCodes);
      }
      const cleanOut = mergeOutboundReceiptsAdditive(store.outbound, [], store.tombstones.outbound);
      if (cleanOut.changed) {
        const prevCodes = store.outbound.map((r) => normKey(r.issueCode || r.id));
        store.outbound = cleanOut.list;
        scheduleSaveReceipts('outbound', prevCodes);
      }
      const cleanMat = mergeMaterialsAdditive(store.materials, [], store.tombstones.materials);
      if (cleanMat.changed) {
        store.materials = cleanMat.list;
        store.materialsRevision++;
        scheduleSaveMaterials();
      }
    }

    if (Array.isArray(users)) {
      const mergedU = mergeUsersAdditive(store.users, users, store.tombstones.users);
      if (mergedU.changed) {
        store.users = mergedU.list;
        anyChanged = true;
      }
    }

    const validActiveUserKeys = new Set<string>();
    for (let i = 0; i < store.users.length; i++) {
      const u = store.users[i];
      const uKey = normUserKey(u.username);
      const uRev = Number(u.sessionRevokedAt) || 0;
      if (uKey && uRev > (store.sessionRevokedBefore[uKey] || 0)) {
        store.sessionRevokedBefore[uKey] = uRev;
      }
      if (u.isActive) {
        validActiveUserKeys.add(uKey);
        const sess = store.activeSessions[uKey];
        if (sess && uRev > 0 && getSessionIssuedAtMs(sess) <= uRev) {
          delete store.activeSessions[uKey];
          anyChanged = true;
        }
      } else if (store.activeSessions[uKey]) {
        delete store.activeSessions[uKey];
        anyChanged = true;
        broadcastRaw({ type: 'auth:user_disabled', userKey: uKey });
      }
    }
    for (const sKey of Object.keys(store.activeSessions)) {
      if (!validActiveUserKeys.has(sKey) && store.tombstones.users[sKey]) {
        delete store.activeSessions[sKey];
        anyChanged = true;
        broadcastRaw({ type: 'auth:user_disabled', userKey: sKey });
      }
    }

    if (Array.isArray(warehouses)) {
      const mergedW = mergeWarehousesAdditive(
        store.warehouses,
        warehouses,
        store.tombstones.warehouses
      );
      if (mergedW.changed) {
        store.warehouses = mergedW.list;
        anyChanged = true;
      }
    }

    if (Array.isArray(req.body.osd)) {
      const mergedO = mergeOsdReceiptsAdditive(store.osd || [], req.body.osd, store.tombstones.osd, 'server');
      if (mergedO.changed) {
        store.osd = mergedO.list;
        anyChanged = true;
        broadcastRaw({
          type: 'sync:osd_updated',
          osd: store.osd,
          tombstones: store.tombstones.osd,
          serverRevision: store.serverRevision + 1
        });
      }
    }

    if (anyChanged) {
      store.serverRevision++;
      scheduleSaveMeta();
      broadcastUpdate(clientId);
    }

    res.json({
      ok: true,
      changed: anyChanged,
      serverRevision: store.serverRevision,
      metaDigest: computeMetaDigest(store.users, store.warehouses, store.tombstones, store.osd || []),
      users: store.users,
      warehouses: store.warehouses,
      tombstones: store.tombstones,
      osd: store.osd || []
    });
  });

  // Lưu và truy xuất file PDF đính kèm của biên bản OSD
  const osdAttachmentsMap = new Map<string, any>();

  app.post('/api/osd/attachment', (req, res) => {
    const { osdId, attachment } = req.body || {};
    if (!osdId || !attachment || !attachment.dataUrl) {
      return res.status(400).json({ ok: false, message: 'Thiếu dữ liệu file đính kèm' });
    }
    const safeId = String(osdId).trim();
    osdAttachmentsMap.set(safeId, attachment);
    if (Array.isArray(store.osd)) {
      const idx = store.osd.findIndex((o) => o.id === safeId || normKey(o.osdCode) === normKey(safeId));
      if (idx !== -1) {
        store.osd[idx].pdfAttachment = attachment;
        store.serverRevision++;
        scheduleSaveMeta();
        broadcastRaw({
          type: 'sync:osd_updated',
          osd: store.osd,
          tombstones: store.tombstones.osd,
          serverRevision: store.serverRevision
        });
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/osd/attachment/:osdId', (req, res) => {
    const safeId = String(req.params.osdId || '').trim();
    const inMem = osdAttachmentsMap.get(safeId);
    if (inMem) {
      return res.json({ ok: true, attachment: inMem });
    }
    if (Array.isArray(store.osd)) {
      const found = store.osd.find((o) => o.id === safeId || normKey(o.osdCode) === normKey(safeId));
      if (found?.pdfAttachment?.dataUrl) {
        osdAttachmentsMap.set(safeId, found.pdfAttachment);
        return res.json({ ok: true, attachment: found.pdfAttachment });
      }
    }
    res.status(404).json({ ok: false, message: 'Không tìm thấy file đính kèm' });
  });

  // ==========================================================================
  // GIAO THỨC ĐỒNG BỘ OSD CHUYÊN BIỆT (DEDICATED OSD PROTOCOL)
  // Đồng bộ tức thì và bảo đảm hội tụ dữ liệu giữa tất cả người dùng và thiết bị
  // ==========================================================================
  app.get('/api/sync/osd', (req, res) => {
    res.json({
      ok: true,
      serverRevision: store.serverRevision,
      osdRevision: store.osdRevision || 1,
      osd: store.osd || [],
      tombstones: store.tombstones.osd || {}
    });
  });

  app.post('/api/sync/osd', (req, res) => {
    const { clientId, osd, tombstones } = req.body || {};
    let changed = false;

    if (tombstones && typeof tombstones === 'object') {
      if (!store.tombstones.osd) store.tombstones.osd = {};
      for (const [k, ts] of Object.entries(tombstones as Record<string, number>)) {
        const num = Number(ts) || 0;
        if (num > (store.tombstones.osd[k] || 0)) {
          store.tombstones.osd[k] = num;
          changed = true;
        }
      }
    }

    if (Array.isArray(osd)) {
      const mergedO = mergeOsdReceiptsAdditive(store.osd || [], osd, store.tombstones.osd, 'server');
      if (mergedO.changed) {
        store.osd = mergedO.list;
        changed = true;
      }
    }

    if (changed) {
      store.osdRevision = (store.osdRevision || 1) + 1;
      store.serverRevision++;
      scheduleSaveMeta();
      broadcastRaw({
        type: 'sync:osd_updated',
        osd: store.osd,
        tombstones: store.tombstones.osd || {},
        osdRevision: store.osdRevision,
        serverRevision: store.serverRevision
      });
      broadcastUpdate(clientId);
    }

    res.json({
      ok: true,
      changed,
      serverRevision: store.serverRevision,
      osdRevision: store.osdRevision || 1,
      osd: store.osd || [],
      tombstones: store.tombstones.osd || {}
    });
  });

  app.get('/api/sync/materials', (req, res) => {
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(3500, Math.max(100, Number(req.query.limit) || 3500));
    const slice = store.materials.slice(offset, offset + limit);
    res.json({
      items: slice,
      total: store.materials.length,
      hasMore: offset + slice.length < store.materials.length,
      materialsRevision: store.materialsRevision,
      materialsDigest: getMaterialsDigestCached()
    });
  });

  app.post('/api/sync/materials', (req, res) => {
    const { clientId, items, tombstones, suppressBroadcast } = req.body || {};
    let changed = false;

    if (tombstones && mergeTombstones(store.tombstones, { materials: tombstones })) {
      changed = true;
      scheduleSaveMeta();
    }

    if (Array.isArray(items) && items.length > 0) {
      const merged = mergeMaterialsAdditive(store.materials, items, store.tombstones.materials);
      if (merged.changed) {
        store.materials = merged.list;
        changed = true;
      }
    } else if (changed) {
      const merged = mergeMaterialsAdditive(store.materials, [], store.tombstones.materials);
      store.materials = merged.list;
    }

    if (changed) {
      store.materialsRevision++;
      store.serverRevision++;
      scheduleSaveMaterials();
      scheduleSaveMeta();
      if (!suppressBroadcast) {
        broadcastUpdate(clientId);
      }
    } else if (!suppressBroadcast) {
      broadcastUpdate(clientId);
    }

    res.json({
      ok: true,
      changed,
      materialsCount: store.materials.length,
      materialsRevision: store.materialsRevision,
      materialsDigest: getMaterialsDigestCached(),
      serverRevision: store.serverRevision
    });
  });

  app.post('/api/sync/receipts-push', (req, res) => {
    const { clientId, type, receipts, suppressBroadcast } = req.body || {};
    if ((type !== 'inbound' && type !== 'outbound') || !Array.isArray(receipts)) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    let changed = false;
    if (type === 'inbound') {
      const merged = mergeInboundReceiptsAdditive(
        store.inbound,
        receipts as InboundReceipt[],
        store.tombstones.inbound
      );
      if (merged.changed) {
        store.inbound = merged.list;
        changed = true;
        scheduleSaveReceipts('inbound', merged.touchedCodes);
      }
    } else {
      const merged = mergeOutboundReceiptsAdditive(
        store.outbound,
        receipts as OutboundReceipt[],
        store.tombstones.outbound
      );
      if (merged.changed) {
        store.outbound = merged.list;
        changed = true;
        scheduleSaveReceipts('outbound', merged.touchedCodes);
      }
    }

    if (changed) {
      store.serverRevision++;
      scheduleSaveMeta();
      if (!suppressBroadcast) {
        broadcastUpdate(clientId);
      }
    } else if (!suppressBroadcast) {
      broadcastUpdate(clientId);
    }

    res.json({
      ok: true,
      changed,
      serverRevision: store.serverRevision
    });
  });

  app.post('/api/sync/receipts-batch-pull', (req, res) => {
    const { type, codes } = req.body || {};
    if ((type !== 'inbound' && type !== 'outbound') || !Array.isArray(codes)) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const MAX_ITEMS_PER_RESPONSE = 3500;
    let itemsCount = 0;
    const returnedReceipts: Array<InboundReceipt | OutboundReceipt> = [];
    const remainingLargeCodes: Array<{ code: string; nextOffset: number; totalItems: number }> = [];
    const unprocessedCodes: string[] = [];

    if (type === 'inbound') {
      const map = new Map<string, InboundReceipt>();
      for (let i = 0; i < store.inbound.length; i++) {
        map.set(normKey(store.inbound[i].receiptCode || store.inbound[i].id), store.inbound[i]);
      }

      for (let i = 0; i < codes.length; i++) {
        const c = normKey(codes[i]);
        const rcp = map.get(c);
        if (!rcp) continue;

        if (
          itemsCount > 0 &&
          itemsCount + Math.min(rcp.items.length, MAX_ITEMS_PER_RESPONSE) > MAX_ITEMS_PER_RESPONSE
        ) {
          unprocessedCodes.push(c);
          continue;
        }

        if (rcp.items.length <= MAX_ITEMS_PER_RESPONSE) {
          returnedReceipts.push(rcp);
          itemsCount += rcp.items.length;
        } else {
          const slice = rcp.items.slice(0, MAX_ITEMS_PER_RESPONSE);
          returnedReceipts.push({ ...rcp, items: slice });
          itemsCount += slice.length;
          remainingLargeCodes.push({
            code: c,
            nextOffset: slice.length,
            totalItems: rcp.items.length
          });
        }
      }
    } else {
      const map = new Map<string, OutboundReceipt>();
      for (let i = 0; i < store.outbound.length; i++) {
        map.set(normKey(store.outbound[i].issueCode || store.outbound[i].id), store.outbound[i]);
      }

      for (let i = 0; i < codes.length; i++) {
        const c = normKey(codes[i]);
        const rcp = map.get(c);
        if (!rcp) continue;

        if (
          itemsCount > 0 &&
          itemsCount + Math.min(rcp.items.length, MAX_ITEMS_PER_RESPONSE) > MAX_ITEMS_PER_RESPONSE
        ) {
          unprocessedCodes.push(c);
          continue;
        }

        if (rcp.items.length <= MAX_ITEMS_PER_RESPONSE) {
          returnedReceipts.push(rcp);
          itemsCount += rcp.items.length;
        } else {
          const slice = rcp.items.slice(0, MAX_ITEMS_PER_RESPONSE);
          returnedReceipts.push({ ...rcp, items: slice });
          itemsCount += slice.length;
          remainingLargeCodes.push({
            code: c,
            nextOffset: slice.length,
            totalItems: rcp.items.length
          });
        }
      }
    }

    res.json({
      receipts: returnedReceipts,
      remainingLargeCodes,
      unprocessedCodes
    });
  });

  app.get('/api/sync/receipt-chunk', (req, res) => {
    const type = String(req.query.type || '');
    const code = normKey(String(req.query.code || ''));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(3500, Math.max(500, Number(req.query.limit) || 3500));

    if (type === 'inbound') {
      const rcp = store.inbound.find((r) => normKey(r.receiptCode || r.id) === code);
      if (!rcp) {
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }
      const itemsSlice = rcp.items.slice(offset, offset + limit);
      res.json({
        receipt: { ...rcp, items: itemsSlice },
        nextOffset: offset + itemsSlice.length,
        totalItems: rcp.items.length,
        hasMore: offset + itemsSlice.length < rcp.items.length
      });
      return;
    }

    if (type === 'outbound') {
      const rcp = store.outbound.find((r) => normKey(r.issueCode || r.id) === code);
      if (!rcp) {
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }
      const itemsSlice = rcp.items.slice(offset, offset + limit);
      res.json({
        receipt: { ...rcp, items: itemsSlice },
        nextOffset: offset + itemsSlice.length,
        totalItems: rcp.items.length,
        hasMore: offset + itemsSlice.length < rcp.items.length
      });
      return;
    }

    res.status(400).json({ error: 'Invalid type' });
  });

  return {
    app,
    store,
    ensureInitialized,
    validateSession
  };
}
