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
  ActiveUserSession
} from '../types/inventory.ts';
import {
  createEmptyTombstones,
  normKey,
  normUserKey,
  computeMetaDigest,
  computeMaterialsDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  mergeTombstones,
  mergeUsersAdditive,
  mergeWarehousesAdditive,
  mergeMaterialsAdditive,
  mergeInboundReceiptsAdditive,
  mergeOutboundReceiptsAdditive
} from '../utils/additiveMerge.ts';

const SESSION_HMAC_SECRET =
  process.env.SESSION_SECRET || 'vtp-inventory-single-device-hmac-secret-2026-v2';

const ROOT_ADMIN_FALLBACK: User = {
  id: 'user-admin-01',
  username: 'Võ Dương Phú',
  fullName: 'Võ Dương Phú (Tổng Quản Trị)',
  role: 'admin',
  password: '1234567',
  email: 'voduongphu@gmail.com',
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
  activeSessions: Record<string, ActiveUserSession>;
  revokedTokens: Record<string, number>;
}

export interface SyncBackendOptions {
  isServerless?: boolean;
  onBroadcastRaw?: (payload: Record<string, unknown>) => void;
}

export interface SyncBackendInstance {
  app: Express;
  store: ServerStore;
  ensureInitialized: () => Promise<void>;
}

function createSignedSessionToken(userKey: string, deviceId: string, issuedAtMs: number): string {
  const nonce = crypto.randomUUID();
  const sig = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(`${userKey}|${deviceId}|${nonce}|${issuedAtMs}`)
    .digest('hex')
    .slice(0, 24);
  return `${nonce}.${issuedAtMs}.${sig}`;
}

function verifySignedSessionToken(
  token: string,
  userKey: string,
  deviceId: string
): { validSignature: boolean; issuedAtMs: number } {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return { validSignature: false, issuedAtMs: 0 };
  }
  const [nonce, rawTs, sig] = parts;
  const issuedAtMs = Number(rawTs);
  if (!nonce || !Number.isFinite(issuedAtMs) || issuedAtMs <= 0 || !sig) {
    return { validSignature: false, issuedAtMs: 0 };
  }
  const expected = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(`${userKey}|${deviceId}|${nonce}|${issuedAtMs}`)
    .digest('hex')
    .slice(0, 24);
  if (sig.length !== expected.length) {
    return { validSignature: false, issuedAtMs: 0 };
  }
  const match = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return { validSignature: match, issuedAtMs: match ? issuedAtMs : 0 };
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
    activeSessions: {},
    revokedTokens: {}
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

  async function loadDirIntoStore(dirPath: string): Promise<void> {
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
        if (parsed.tombstones) {
          mergeTombstones(store.tombstones, parsed.tombstones);
        }
        if (Array.isArray(parsed.users)) {
          const mergedU = mergeUsersAdditive(store.users, parsed.users, store.tombstones.users);
          store.users = mergedU.list;
        }
        if (Array.isArray(parsed.warehouses)) {
          const mergedW = mergeWarehousesAdditive(
            store.warehouses,
            parsed.warehouses,
            store.tombstones.warehouses
          );
          store.warehouses = mergedW.list;
        }
        if (parsed.activeSessions && typeof parsed.activeSessions === 'object') {
          for (const [rawKey, sess] of Object.entries(
            parsed.activeSessions as Record<string, ActiveUserSession>
          )) {
            if (sess && sess.sessionToken) {
              const cleanKey = normUserKey(sess.username || sess.userKey || rawKey);
              const existing = store.activeSessions[cleanKey];
              if (!existing || (sess.lastSeenAt || 0) >= (existing.lastSeenAt || 0)) {
                store.activeSessions[cleanKey] = {
                  ...sess,
                  userKey: cleanKey
                };
              }
            }
          }
        }
        if (parsed.revokedTokens && typeof parsed.revokedTokens === 'object') {
          Object.assign(store.revokedTokens, parsed.revokedTokens);
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

      // Nếu chạy trên Serverless (Vercel /tmp), nạp dữ liệu gốc từ .sync_data trước rồi hợp nhất /tmp lên trên
      if (dataDir !== seedDir && fs.existsSync(seedDir)) {
        await loadDirIntoStore(seedDir);
      }
      await loadDirIntoStore(dataDir);

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
        users: store.users,
        warehouses: store.warehouses,
        tombstones: store.tombstones,
        activeSessions: store.activeSessions,
        revokedTokens: store.revokedTokens
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

  function tryRecoverServerlessSession(
    key: string,
    user: User,
    sessionToken: string,
    deviceId?: string,
    deviceLabel?: string,
    loginAt?: string
  ): ActiveUserSession | null {
    if (!isServerless) return null;
    if (!deviceId || store.revokedTokens[sessionToken]) return null;

    const { validSignature, issuedAtMs } = verifySignedSessionToken(sessionToken, key, deviceId);
    if (!validSignature) return null;

    const userLastLoginMs = user.lastLogin ? Date.parse(user.lastLogin) : 0;
    if (userLastLoginMs > 0 && issuedAtMs + 1500 < userLastLoginMs) {
      // Đã có một lần đăng nhập mới hơn được ghi nhận
      return null;
    }

    const recovered: ActiveUserSession = {
      userId: user.id,
      username: user.username,
      userKey: key,
      sessionToken,
      deviceId,
      deviceLabel: deviceLabel || 'Thiết bị hiện tại',
      loginAt: loginAt || new Date(issuedAtMs).toISOString(),
      lastSeenAt: Date.now()
    };
    store.activeSessions[key] = recovered;
    scheduleSaveMeta();
    return recovered;
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
    res.setHeader('Access-Control-Expose-Headers', 'X-Auth-Invalidated, X-Auth-Replaced-By');
    next();
  });

  // Kiểm tra tức thì hiệu lực phiên trên mọi request đồng bộ (/api/sync/*) có gửi kèm session header
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

    const isReadSync = req.method === 'GET' || req.path === '/receipts-batch-pull';
    const user = store.users.find((u) => normUserKey(u.username) === key);
    if (!user || !user.isActive) {
      res.setHeader('X-Auth-Invalidated', 'disabled');
      if (!isReadSync) {
        res.status(401).json({ error: 'Account disabled', reason: 'disabled' });
        return;
      }
      next();
      return;
    }

    let active: ActiveUserSession | undefined = store.activeSessions[key];
    if (!active) {
      active =
        tryRecoverServerlessSession(key, user, token, deviceId, deviceLabel) || undefined;
    }

    if (!active) {
      res.setHeader('X-Auth-Invalidated', 'expired');
      if (!isReadSync) {
        res.status(401).json({ error: 'Session expired', reason: 'expired' });
        return;
      }
      next();
      return;
    }

    if (active.sessionToken !== token) {
      res.setHeader('X-Auth-Invalidated', 'replaced');
      res.setHeader('X-Auth-Replaced-By', encodeURIComponent(JSON.stringify(active)));
      if (!isReadSync) {
        res.status(401).json({ error: 'Session replaced', reason: 'replaced', replacedBy: active });
        return;
      }
      next();
      return;
    }

    active.lastSeenAt = Date.now();
    next();
  });

  // ==========================================================================
  // AUTH & SINGLE-DEVICE SESSION ENFORCEMENT
  // ==========================================================================
  app.post('/api/auth/login', async (req, res) => {
    const { username, password, deviceId, deviceLabel, localUsers } = req.body || {};
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

    const inputKey = normUserKey(trimmedUser);
    const matchedIdx = store.users.findIndex(
      (u) => normUserKey(u.username) === inputKey || normUserKey(u.fullName) === inputKey
    );

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

    if ((user.password || '') !== passStr) {
      res.json({
        success: false,
        message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
      });
      return;
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const userKey = normUserKey(user.username);
    const cleanDeviceId = String(deviceId || `dev-${nowMs}`);
    const cleanDeviceLabel = String(deviceLabel || 'Thiết bị khác');
    const sessionToken = createSignedSessionToken(userKey, cleanDeviceId, nowMs);

    const previousSession = store.activeSessions[userKey];
    if (previousSession && previousSession.sessionToken) {
      store.revokedTokens[previousSession.sessionToken] = nowMs;
    }

    const replacedPrevious =
      previousSession &&
      previousSession.sessionToken !== sessionToken &&
      (previousSession.deviceId !== cleanDeviceId || nowMs - (previousSession.lastSeenAt || 0) <= 15000)
        ? { ...previousSession }
        : undefined;

    const updatedUser: User = {
      ...user,
      lastLogin: nowIso,
      updatedAt: Math.max(nowMs, Number(user.updatedAt || 0) + 1)
    };
    store.users[matchedIdx] = updatedUser;

    const session: ActiveUserSession = {
      userId: updatedUser.id,
      username: updatedUser.username,
      userKey,
      sessionToken,
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
      deviceId: cleanDeviceId,
      deviceLabel: cleanDeviceLabel,
      loginAt: nowIso
    });
    broadcastUpdate();

    res.json({
      success: true,
      message: replacedPrevious
        ? `Đăng nhập thành công! Hệ thống đã tự động đăng xuất phiên đang mở trên ${replacedPrevious.deviceLabel || 'thiết bị khác'}.`
        : 'Đăng nhập thành công!',
      user: updatedUser,
      session,
      replacedSession: replacedPrevious,
      users: store.users
    });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const { userKey, sessionToken } = req.body || {};
    const key = normUserKey(String(userKey || ''));
    if (sessionToken) {
      store.revokedTokens[String(sessionToken)] = Date.now();
    }
    if (key && store.activeSessions[key]) {
      if (sessionToken && store.activeSessions[key].sessionToken === sessionToken) {
        delete store.activeSessions[key];
        store.serverRevision++;
        await writeMetaToDiskNow();
        broadcastRaw({ type: 'auth:session_expired', userKey: key });
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/verify-session', async (req, res) => {
    const { userId, username, userKey, sessionToken, deviceId, deviceLabel, loginAt } =
      req.body || {};
    const key = normUserKey(String(userKey || username || ''));
    if (!key || !sessionToken) {
      res.json({ valid: false, reason: 'missing' });
      return;
    }

    const user = store.users.find((u) => normUserKey(u.username) === key || u.id === userId);
    if (!user || !user.isActive) {
      if (store.activeSessions[key]) {
        delete store.activeSessions[key];
        scheduleSaveMeta();
      }
      res.json({ valid: false, reason: 'disabled' });
      return;
    }

    let active: ActiveUserSession | undefined = store.activeSessions[key];
    if (!active) {
      active =
        tryRecoverServerlessSession(
          key,
          user,
          String(sessionToken),
          deviceId ? String(deviceId) : undefined,
          deviceLabel ? String(deviceLabel) : undefined,
          loginAt ? String(loginAt) : undefined
        ) || undefined;
    }

    if (!active) {
      res.json({ valid: false, reason: 'expired' });
      return;
    }

    if (active.sessionToken !== sessionToken) {
      res.json({
        valid: false,
        reason: 'replaced',
        replacedBy: active
      });
      return;
    }

    active.lastSeenAt = Date.now();
    res.json({
      valid: true,
      session: active
    });
  });

  // ==========================================================================
  // DATA SYNCHRONIZATION ENDPOINTS (100% ADDITIVE MERGE, 100k+ ROWS READY)
  // ==========================================================================
  app.get('/api/sync/manifest', (_req, res) => {
    const inboundManifest = store.inbound.map((r) => ({
      code: normKey(r.receiptCode || r.id),
      receiptCode: r.receiptCode,
      id: r.id,
      itemCount: r.items.length,
      updatedAt: r.updatedAt || 0,
      digest: computeInboundReceiptDigest(r)
    }));

    const outboundManifest = store.outbound.map((r) => ({
      code: normKey(r.issueCode || r.id),
      issueCode: r.issueCode,
      id: r.id,
      itemCount: r.items.length,
      updatedAt: r.updatedAt || 0,
      digest: computeOutboundReceiptDigest(r)
    }));

    res.json({
      serverRevision: store.serverRevision,
      materialsRevision: store.materialsRevision,
      materialsCount: store.materials.length,
      materialsDigest: getMaterialsDigestCached(),
      metaDigest: computeMetaDigest(store.users, store.warehouses, store.tombstones),
      activeSessions: store.activeSessions,
      users: store.users,
      warehouses: store.warehouses,
      tombstones: store.tombstones,
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
      if (u.isActive) {
        validActiveUserKeys.add(uKey);
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

    if (anyChanged) {
      store.serverRevision++;
      scheduleSaveMeta();
      broadcastUpdate(clientId);
    }

    res.json({
      ok: true,
      changed: anyChanged,
      serverRevision: store.serverRevision,
      metaDigest: computeMetaDigest(store.users, store.warehouses, store.tombstones),
      users: store.users,
      warehouses: store.warehouses,
      tombstones: store.tombstones
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
    ensureInitialized
  };
}
