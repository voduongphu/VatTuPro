import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  OutboundReceipt,
  TombstoneMap,
  ActiveUserSession
} from './src/types/inventory.ts';
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
} from './src/utils/additiveMerge.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(process.cwd(), '.sync_data');
const INBOUND_DIR = path.join(DATA_DIR, 'inbound');
const OUTBOUND_DIR = path.join(DATA_DIR, 'outbound');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');

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

interface ServerStore {
  serverRevision: number;
  materialsRevision: number;
  users: User[];
  warehouses: Warehouse[];
  materials: MaterialItem[];
  inbound: InboundReceipt[];
  outbound: OutboundReceipt[];
  tombstones: TombstoneMap;
  activeSessions: Record<string, ActiveUserSession>;
}

const store: ServerStore = {
  serverRevision: 1,
  materialsRevision: 1,
  users: [],
  warehouses: [],
  materials: [],
  inbound: [],
  outbound: [],
  tombstones: createEmptyTombstones(),
  activeSessions: {}
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

function codeToFileName(code: string): string {
  const hash = crypto.createHash('sha1').update(normKey(code)).digest('hex');
  return `${hash}.json`;
}

async function ensureDirs(): Promise<void> {
  await fsp.mkdir(INBOUND_DIR, { recursive: true });
  await fsp.mkdir(OUTBOUND_DIR, { recursive: true });
}

async function loadFromDisk(): Promise<void> {
  await ensureDirs();

  try {
    if (fs.existsSync(META_FILE)) {
      const raw = await fsp.readFile(META_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      store.serverRevision = Number(parsed.serverRevision) || 1;
      store.materialsRevision = Number(parsed.materialsRevision) || 1;
      store.users = Array.isArray(parsed.users) ? parsed.users : [];
      store.warehouses = Array.isArray(parsed.warehouses) ? parsed.warehouses : [];
      if (parsed.tombstones) {
        mergeTombstones(store.tombstones, parsed.tombstones);
      }
      if (parsed.activeSessions && typeof parsed.activeSessions === 'object') {
        const normalizedSessions: Record<string, ActiveUserSession> = {};
        for (const [rawKey, sess] of Object.entries(parsed.activeSessions as Record<string, ActiveUserSession>)) {
          if (sess && sess.sessionToken) {
            const cleanKey = normUserKey(sess.username || sess.userKey || rawKey);
            normalizedSessions[cleanKey] = {
              ...sess,
              userKey: cleanKey
            };
          }
        }
        store.activeSessions = normalizedSessions;
      }
    }
  } catch (err) {
    console.error('Failed to load meta.json:', err);
  }

  if (store.users.length === 0) {
    store.users = [ROOT_ADMIN_FALLBACK];
  }

  try {
    if (fs.existsSync(MATERIALS_FILE)) {
      const raw = await fsp.readFile(MATERIALS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        store.materials = parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load materials.json:', err);
  }

  try {
    const inFiles = await fsp.readdir(INBOUND_DIR);
    const loadedInbounds: InboundReceipt[] = [];
    for (const file of inFiles) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fsp.readFile(path.join(INBOUND_DIR, file), 'utf8');
        const rcp = JSON.parse(raw) as InboundReceipt;
        if (rcp && rcp.receiptCode) {
          loadedInbounds.push(rcp);
        }
      } catch {
        // skip corrupted file
      }
    }
    loadedInbounds.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const mergedIn = mergeInboundReceiptsAdditive(loadedInbounds, [], store.tombstones.inbound);
    store.inbound = mergedIn.list;
  } catch (err) {
    console.error('Failed to load inbound dir:', err);
  }

  try {
    const outFiles = await fsp.readdir(OUTBOUND_DIR);
    const loadedOutbounds: OutboundReceipt[] = [];
    for (const file of outFiles) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fsp.readFile(path.join(OUTBOUND_DIR, file), 'utf8');
        const rcp = JSON.parse(raw) as OutboundReceipt;
        if (rcp && rcp.issueCode) {
          loadedOutbounds.push(rcp);
        }
      } catch {
        // skip corrupted file
      }
    }
    loadedOutbounds.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const mergedOut = mergeOutboundReceiptsAdditive(loadedOutbounds, [], store.tombstones.outbound);
    store.outbound = mergedOut.list;
  } catch (err) {
    console.error('Failed to load outbound dir:', err);
  }
}

let metaSaveTimer: ReturnType<typeof setTimeout> | null = null;
let materialsSaveTimer: ReturnType<typeof setTimeout> | null = null;
const dirtyInboundCodes = new Set<string>();
const dirtyOutboundCodes = new Set<string>();
let receiptsSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function writeMetaToDiskNow(): Promise<void> {
  try {
    const payload = JSON.stringify({
      serverRevision: store.serverRevision,
      materialsRevision: store.materialsRevision,
      users: store.users,
      warehouses: store.warehouses,
      tombstones: store.tombstones,
      activeSessions: store.activeSessions
    });
    await fsp.writeFile(META_FILE, payload, 'utf8');
  } catch (err) {
    console.error('Error saving meta.json:', err);
  }
}

function scheduleSaveMeta(delayMs = 150): void {
  if (metaSaveTimer) clearTimeout(metaSaveTimer);
  metaSaveTimer = setTimeout(() => {
    void writeMetaToDiskNow();
  }, delayMs);
}

function scheduleSaveMaterials(): void {
  if (materialsSaveTimer) clearTimeout(materialsSaveTimer);
  materialsSaveTimer = setTimeout(async () => {
    try {
      await fsp.writeFile(MATERIALS_FILE, JSON.stringify(store.materials), 'utf8');
    } catch (err) {
      console.error('Error saving materials.json:', err);
    }
  }, 300);
}

function scheduleSaveReceipts(type: 'inbound' | 'outbound', codes: string[]): void {
  const targetSet = type === 'inbound' ? dirtyInboundCodes : dirtyOutboundCodes;
  for (let i = 0; i < codes.length; i++) {
    targetSet.add(normKey(codes[i]));
  }
  if (receiptsSaveTimer) clearTimeout(receiptsSaveTimer);
  receiptsSaveTimer = setTimeout(async () => {
    const inCodes = Array.from(dirtyInboundCodes);
    const outCodes = Array.from(dirtyOutboundCodes);
    dirtyInboundCodes.clear();
    dirtyOutboundCodes.clear();

    if (inCodes.length > 0) {
      const inMap = new Map<string, InboundReceipt>();
      for (let i = 0; i < store.inbound.length; i++) {
        inMap.set(normKey(store.inbound[i].receiptCode || store.inbound[i].id), store.inbound[i]);
      }
      for (const code of inCodes) {
        const filePath = path.join(INBOUND_DIR, codeToFileName(code));
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
        const filePath = path.join(OUTBOUND_DIR, codeToFileName(code));
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
  }, 250);
}

async function startServer() {
  await loadFromDisk();

  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Cấm cache tuyệt đối cho mọi API đồng bộ & xác thực để mọi thiết bị luôn nhận dữ liệu mới nhất tức thì
  app.use('/api', (_req, res, next) => {
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
    const key = normUserKey(typeof rawUserKey === 'string' ? decodeURIComponent(rawUserKey) : '');
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';

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

    const active = store.activeSessions[key];
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

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const broadcastRaw = (payload: Record<string, unknown>) => {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  const broadcastUpdate = (senderClientId?: string) => {
    broadcastRaw({
      type: 'sync:updated',
      serverRevision: store.serverRevision,
      materialsRevision: store.materialsRevision,
      senderClientId: senderClientId || ''
    });
  };

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'sync:hello',
        serverRevision: store.serverRevision,
        materialsRevision: store.materialsRevision,
        activeSessions: store.activeSessions
      })
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg && msg.type === 'auth:check') {
          const key = normUserKey(String(msg.userKey || ''));
          const token = String(msg.sessionToken || '');
          if (!key || !token) return;

          const user = store.users.find((u) => normUserKey(u.username) === key);
          if (!user || !user.isActive) {
            socket.send(JSON.stringify({ type: 'auth:user_disabled', userKey: key }));
            return;
          }

          const active = store.activeSessions[key];
          if (!active) {
            socket.send(JSON.stringify({ type: 'auth:session_expired', userKey: key }));
            return;
          }

          if (active.sessionToken !== token) {
            socket.send(
              JSON.stringify({
                type: 'auth:session_replaced',
                userKey: key,
                userId: active.userId,
                activeSessionToken: active.sessionToken,
                deviceId: active.deviceId,
                deviceLabel: active.deviceLabel,
                loginAt: active.loginAt
              })
            );
          } else {
            active.lastSeenAt = Date.now();
          }
        }
      } catch {
        // ignore malformed ws client message
      }
    });
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

    // Nếu máy khách gửi kèm danh sách user cục bộ, cộng gộp trước để tài khoản mới tạo khả dụng ngay
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
    const sessionToken = crypto.randomUUID();
    const cleanDeviceId = String(deviceId || `dev-${nowMs}`);
    const cleanDeviceLabel = String(deviceLabel || 'Thiết bị khác');

    const previousSession = store.activeSessions[userKey];
    const replacedPrevious =
      previousSession &&
      previousSession.sessionToken !== sessionToken &&
      (previousSession.deviceId !== cleanDeviceId || nowMs - (previousSession.lastSeenAt || 0) <= 15000)
        ? { ...previousSession }
        : undefined;

    const updatedUser: User = {
      ...user,
      lastLogin: nowIso
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

    // Ghi đè phiên hoạt động duy nhất của user này -> vô hiệu hóa tức thì mọi thiết bị cũ đang đăng nhập cùng tài khoản
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
    if (key && store.activeSessions[key]) {
      // Chỉ xóa phiên trên Server nếu đúng là thiết bị đang giữ phiên hợp lệ (thiết bị cũ bị đá ra không được xóa phiên của thiết bị mới)
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
    const { userId, username, userKey, sessionToken } = req.body || {};
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

    const active = store.activeSessions[key];
    if (!active) {
      // Tuyệt đối KHÔNG tự tạo lại phiên nếu chưa qua /api/auth/login
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
  // 1. Lấy Manifest kèm chữ ký băm (digest) chính xác cho từng bảng & từng phiếu
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

  // 2. Đồng bộ cộng gộp Users, Warehouses & Tombstones
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

    // Nếu tài khoản bị khóa hoặc bị xóa bởi Admin -> hủy phiên hoạt động và thông báo thoát ngay
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
      const mergedW = mergeWarehousesAdditive(store.warehouses, warehouses, store.tombstones.warehouses);
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

  // 3. Tải danh mục vật tư phân trang (mặc định 5.000 dòng/lô, gọn nhẹ dưới giới hạn Cloud Run)
  app.get('/api/sync/materials', (req, res) => {
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(10000, Math.max(100, Number(req.query.limit) || 5000));
    const slice = store.materials.slice(offset, offset + limit);
    res.json({
      items: slice,
      total: store.materials.length,
      hasMore: offset + slice.length < store.materials.length,
      materialsRevision: store.materialsRevision,
      materialsDigest: getMaterialsDigestCached()
    });
  });

  // 4. Đẩy danh mục vật tư cộng gộp theo lô
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
      // Đảm bảo thông báo ở gói cuối cùng nếu các gói trước đó có suppressBroadcast = true
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

  // 5. Đẩy phiếu Nhập / Xuất cộng gộp (hỗ trợ cả phiếu lẻ và phiếu >100.000 dòng chia lát 2.500 dòng)
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

  // 6. Tải hàng loạt các phiếu nhỏ hoặc lát cắt đầu của phiếu lớn (tối đa 5.000 items mỗi gói trả về ~2MB)
  app.post('/api/sync/receipts-batch-pull', (req, res) => {
    const { type, codes } = req.body || {};
    if ((type !== 'inbound' && type !== 'outbound') || !Array.isArray(codes)) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const MAX_ITEMS_PER_RESPONSE = 5000;
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

        if (itemsCount > 0 && itemsCount + Math.min(rcp.items.length, MAX_ITEMS_PER_RESPONSE) > MAX_ITEMS_PER_RESPONSE) {
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

        if (itemsCount > 0 && itemsCount + Math.min(rcp.items.length, MAX_ITEMS_PER_RESPONSE) > MAX_ITEMS_PER_RESPONSE) {
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

  // 7. Tải tiếp lát cắt dòng vật tư của phiếu lớn (>5.000 - >100.000 dòng)
  app.get('/api/sync/receipt-chunk', (req, res) => {
    const type = String(req.query.type || '');
    const code = normKey(String(req.query.code || ''));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(10000, Math.max(500, Number(req.query.limit) || 5000));

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

  const isDev =
    process.env.DEV_SERVER === 'true' ||
    (process.env.NODE_ENV !== 'production' && !fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')));

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/ws-sync') {
      wss.handleUpgrade(req, socket, head, (wsClient) => {
        wss.emit('connection', wsClient, req);
      });
      return;
    }

    // Trong môi trường dev, nhường các kết nối WebSocket của Vite (vite-hmr) cho Vite server xử lý trên cùng cổng 3000
    const protocol = String(req.headers['sec-websocket-protocol'] || '');
    if (isDev && protocol.includes('vite-hmr')) {
      return;
    }

    if (!isDev) {
      socket.destroy();
    }
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Inventory Sync Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
