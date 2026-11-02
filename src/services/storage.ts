import { 
  User, 
  Warehouse, 
  MaterialItem, 
  InboundReceipt, 
  OutboundReceipt, 
  InventoryStockRecord,
  StockFilterParams,
  TombstoneMap
} from '../types/inventory';
import {
  createEmptyTombstones,
  normKey,
  normUserKey,
  mergeTombstones,
  isRecordDeleted,
  mergeUsersAdditive,
  mergeWarehousesAdditive,
  mergeMaterialsAdditive,
  mergeInboundReceiptsAdditive,
  mergeOutboundReceiptsAdditive
} from '../utils/additiveMerge';

const STORAGE_KEYS = {
  USERS: 'vtp_inventory_users_v2',
  WAREHOUSES: 'vtp_inventory_warehouses_v2',
  MATERIALS: 'vtp_inventory_materials_v2',
  INBOUND: 'vtp_inventory_inbound_v2',
  OUTBOUND: 'vtp_inventory_outbound_v2',
  CURRENT_USER: 'vtp_inventory_current_user_v2',
  TOMBSTONES: 'vtp_inventory_tombstones_v2',
  DELETED_INBOUND: 'vtp_deleted_inbound_ids_v2',
  DELETED_OUTBOUND: 'vtp_deleted_outbound_ids_v2',
  DELETED_MATERIALS: 'vtp_deleted_material_ids_v2',
  DELETED_USERS: 'vtp_deleted_user_ids_v2'
};

const LARGE_DATA_KEYS = new Set<string>([
  STORAGE_KEYS.INBOUND,
  STORAGE_KEYS.OUTBOUND,
  STORAGE_KEYS.MATERIALS
]);

const SEED_FLAG_KEY = 'vtp_inventory_seeded_flag_v4';
const IDB_NAME = 'vtp_inventory_idb_v2';
const IDB_STORE = 'kv_store';
const IDB_VERSION = 1;

// Tài khoản Quản trị gốc mặc định khi hệ thống khởi tạo lần đầu
const ROOT_ADMIN_USER: User = {
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

// ============================================================================
// High-Performance In-Memory Cache + IndexedDB Persistence Engine (100k+ rows)
// ============================================================================
const memoryCache = new Map<string, any>();
let idbPromise: Promise<IDBDatabase | null> | null = null;
let initPromise: Promise<void> | null = null;
let isHydrated = false;
let pendingWrites = new Set<Promise<void>>();

export type LocalMutationKind = 'meta' | 'materials' | 'inbound' | 'outbound';
const subscribers = new Set<() => void>();
const localMutationListeners = new Set<(kind: LocalMutationKind, codes?: string[]) => void>();

function notifySubscribers(): void {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('Subscriber error:', err);
    }
  });
}

function emitLocalMutation(kind: LocalMutationKind, codes?: string[]): void {
  localMutationListeners.forEach((fn) => {
    try {
      fn(kind, codes);
    } catch (err) {
      console.error('Local mutation listener error:', err);
    }
  });
}

// Version counter cho cache tính toán tồn kho
let inventoryVersion = 1;
let cachedBaseVersion = -1;
let cachedBaseRecords: InventoryStockRecord[] = [];
let cachedFilterOptions: {
  availablePLs: string[];
  availableShipments: string[];
  availableMakers: string[];
  availableSuppliers: string[];
  availableCategories: string[];
  totalPLCount: number;
  totalShipmentCount: number;
} = {
  availablePLs: [],
  availableShipments: [],
  availableMakers: [],
  availableSuppliers: [],
  availableCategories: [],
  totalPLCount: 0,
  totalShipmentCount: 0
};

function openIDB(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  if (typeof indexedDB === 'undefined') {
    idbPromise = Promise.resolve(null);
    return idbPromise;
  }

  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('IndexedDB unavailable, using in-memory/localStorage fallback:', req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB open exception:', e);
      resolve(null);
    }
  });
  return idbPromise;
}

async function idbGetAll(db: IDBDatabase): Promise<Map<string, any>> {
  return new Promise((resolve) => {
    const map = new Map<string, any>();
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          map.set(String(cursor.key), cursor.value);
          cursor.continue();
        } else {
          resolve(map);
        }
      };
      cursorReq.onerror = () => resolve(map);
    } catch {
      resolve(map);
    }
  });
}

function idbPut(key: string, value: any): Promise<void> {
  const p = (async () => {
    const db = await openIDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  })();
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p));
  return p;
}

async function idbClear(): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function getItem<T>(key: string, defaultValue: T): T {
  // Ưu tiên tuyệt đối memoryCache (O(1), không bao giờ bị ghi đè bởi dữ liệu cũ khi vượt hạn mức 5MB của localStorage)
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && raw !== undefined) {
      const parsed = JSON.parse(raw);
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch (err) {
    console.error(`Error loading key ${key}:`, err);
  }
  return defaultValue;
}

function setItem<T>(key: string, value: T): void {
  memoryCache.set(key, value);

  if (
    key === STORAGE_KEYS.INBOUND ||
    key === STORAGE_KEYS.OUTBOUND ||
    key === STORAGE_KEYS.WAREHOUSES ||
    key === STORAGE_KEYS.DELETED_INBOUND ||
    key === STORAGE_KEYS.DELETED_OUTBOUND
  ) {
    inventoryVersion++;
  }

  // Ghi bất đồng bộ xuống IndexedDB (hỗ trợ hàng trăm MB / >100.000 dòng mượt mà)
  void idbPut(key, value);

  // Chỉ đồng bộ localStorage đối với dữ liệu cấu hình nhỏ; xóa bản cũ ở localStorage cho bảng lớn để tránh dữ liệu lệch
  if (LARGE_DATA_KEYS.has(key)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

interface AggEntry {
  warehouseId: string;
  warehouseName: string;
  materialCode: string;
  materialName: string;
  unit: string;
  packingListNo: string;
  shipment: string;
  manufacturer: string;
  supplier: string;
  packageNo: string;
  packageName: string;
  category: string;
  drawingNo: string;
  inboundQuantity: number;
  inboundWeightKg: number;
  outboundQuantity: number;
  outboundWeightKg: number;
  lastUpdated: string;
}

function buildAggregatedRecords(
  inbounds: InboundReceipt[],
  outbounds: OutboundReceipt[],
  whMap: Map<string, string>,
  startDate?: string,
  endDate?: string
): InventoryStockRecord[] {
  const groupMap = new Map<string, AggEntry>();

  for (let i = 0; i < inbounds.length; i++) {
    const receipt = inbounds[i];
    if (startDate && receipt.receiptDate < startDate) continue;
    if (endDate && receipt.receiptDate > endDate) continue;

    const whName = receipt.warehouseName || whMap.get(receipt.warehouseId) || 'Kho mặc định';
    const items = receipt.items;
    const rDate = receipt.receiptDate;
    const whId = receipt.warehouseId;

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const pl = item.packingListNo || '';
      const shp = item.shipment || '';
      const mCode = item.materialCode || '';
      const pkgNo = item.packageNo || '';
      const dwg = item.drawingNo || '';
      const cat = item.category || '';
      const key = `${whId}__${pl}__${shp}__${mCode}__${pkgNo}__${dwg}__${cat}`;

      let entry = groupMap.get(key);
      if (!entry) {
        entry = {
          warehouseId: whId,
          warehouseName: whName,
          materialCode: mCode || 'N/A',
          materialName: item.materialName || 'Vật tư',
          unit: item.unit || 'Bộ',
          packingListNo: pl || 'N/A',
          shipment: shp || 'N/A',
          manufacturer: item.manufacturer || 'N/A',
          supplier: item.supplier || 'N/A',
          packageNo: pkgNo || 'N/A',
          packageName: item.packageName || '',
          category: cat || 'N/A',
          drawingNo: dwg || 'N/A',
          inboundQuantity: 0,
          inboundWeightKg: 0,
          outboundQuantity: 0,
          outboundWeightKg: 0,
          lastUpdated: rDate
        };
        groupMap.set(key, entry);
      }

      entry.inboundQuantity += Number(item.quantity) || 0;
      entry.inboundWeightKg += Number(item.weightKg) || 0;
      if (rDate > entry.lastUpdated) {
        entry.lastUpdated = rDate;
      }
    }
  }

  for (let i = 0; i < outbounds.length; i++) {
    const receipt = outbounds[i];
    if (startDate && receipt.issueDate < startDate) continue;
    if (endDate && receipt.issueDate > endDate) continue;

    const whName = receipt.warehouseName || whMap.get(receipt.warehouseId) || 'Kho mặc định';
    const items = receipt.items;
    const iDate = receipt.issueDate;
    const whId = receipt.warehouseId;

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const pl = item.packingListNo || '';
      const shp = item.shipment || '';
      const mCode = item.materialCode || '';
      const pkgNo = item.packageNo || '';
      const dwg = item.drawingNo || '';
      const cat = item.category || '';
      const key = `${whId}__${pl}__${shp}__${mCode}__${pkgNo}__${dwg}__${cat}`;

      let entry = groupMap.get(key);
      if (!entry) {
        entry = {
          warehouseId: whId,
          warehouseName: whName,
          materialCode: mCode || 'N/A',
          materialName: item.materialName || 'Vật tư',
          unit: item.unit || 'Bộ',
          packingListNo: pl || 'N/A',
          shipment: shp || 'N/A',
          manufacturer: item.manufacturer || 'N/A',
          supplier: item.supplier || 'N/A',
          packageNo: pkgNo || 'N/A',
          packageName: item.packageName || '',
          category: cat || 'N/A',
          drawingNo: dwg || 'N/A',
          inboundQuantity: 0,
          inboundWeightKg: 0,
          outboundQuantity: 0,
          outboundWeightKg: 0,
          lastUpdated: iDate
        };
        groupMap.set(key, entry);
      }

      entry.outboundQuantity += Number(item.quantity) || 0;
      entry.outboundWeightKg += Number(item.weightKg) || 0;
      if (iDate > entry.lastUpdated) {
        entry.lastUpdated = iDate;
      }
    }
  }

  const records: InventoryStockRecord[] = new Array(groupMap.size);
  let idx = 0;
  groupMap.forEach((e, key) => {
    const currentQty = e.inboundQuantity - e.outboundQuantity;
    const currentWeight = e.inboundWeightKg - e.outboundWeightKg;
    records[idx++] = {
      id: key,
      warehouseId: e.warehouseId,
      warehouseName: e.warehouseName,
      materialCode: e.materialCode,
      materialName: e.materialName,
      unit: e.unit,
      packingListNo: e.packingListNo,
      shipment: e.shipment,
      manufacturer: e.manufacturer,
      supplier: e.supplier,
      packageNo: e.packageNo,
      packageName: e.packageName,
      category: e.category,
      drawingNo: e.drawingNo,
      inboundQuantity: e.inboundQuantity,
      inboundWeightKg: Math.round(e.inboundWeightKg * 100) / 100,
      outboundQuantity: e.outboundQuantity,
      outboundWeightKg: Math.round(e.outboundWeightKg * 100) / 100,
      currentQuantity: currentQty,
      currentWeightKg: Math.round(currentWeight * 100) / 100,
      lastUpdated: e.lastUpdated
    };
  });

  return records;
}

export const StorageService = {
  // Khởi tạo bất đồng bộ từ IndexedDB (tự động migrate từ localStorage nếu có)
  async init(): Promise<void> {
    if (isHydrated) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const db = await openIDB();
      if (db) {
        const idbMap = await idbGetAll(db);
        idbMap.forEach((val, key) => {
          memoryCache.set(key, val);
        });
      }

      // Migrate dữ liệu từ localStorage nếu chưa có trong IndexedDB
      const allKeys = Object.values(STORAGE_KEYS);
      for (const key of allKeys) {
        if (!memoryCache.has(key)) {
          try {
            const raw = localStorage.getItem(key);
            if (raw !== null && raw !== undefined) {
              const parsed = JSON.parse(raw);
              memoryCache.set(key, parsed);
              void idbPut(key, parsed);
              if (LARGE_DATA_KEYS.has(key)) {
                localStorage.removeItem(key);
              }
            }
          } catch {
            // ignore corrupted localStorage item
          }
        }
      }

      this.ensureInitialized();
      inventoryVersion++;
      isHydrated = true;
    })();

    return initPromise;
  },

  async flush(): Promise<void> {
    if (pendingWrites.size > 0) {
      await Promise.all(Array.from(pendingWrites));
    }
  },

  subscribe(listener: () => void): () => void {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  },

  onLocalMutation(listener: (kind: LocalMutationKind, codes?: string[]) => void): () => void {
    localMutationListeners.add(listener);
    return () => {
      localMutationListeners.delete(listener);
    };
  },

  getTombstones(): TombstoneMap {
    const raw = getItem<TombstoneMap | null>(STORAGE_KEYS.TOMBSTONES, null);
    if (raw && raw.inbound && raw.outbound && raw.materials && raw.warehouses && raw.users) {
      return raw;
    }
    const empty = createEmptyTombstones();
    // Migrate legacy deleted ID lists nếu có
    const legacyIn = getItem<string[]>(STORAGE_KEYS.DELETED_INBOUND, []);
    const legacyOut = getItem<string[]>(STORAGE_KEYS.DELETED_OUTBOUND, []);
    const legacyMat = getItem<string[]>(STORAGE_KEYS.DELETED_MATERIALS, []);
    const legacyUsr = getItem<string[]>(STORAGE_KEYS.DELETED_USERS, []);
    for (const id of legacyIn) {
      empty.inbound[id] = 1;
      empty.inbound[normKey(id)] = 1;
    }
    for (const id of legacyOut) {
      empty.outbound[id] = 1;
      empty.outbound[normKey(id)] = 1;
    }
    for (const id of legacyMat) {
      empty.materials[id] = 1;
      empty.materials[normKey(id)] = 1;
    }
    for (const id of legacyUsr) {
      empty.users[id] = 1;
      empty.users[normUserKey(id)] = 1;
    }
    setItem(STORAGE_KEYS.TOMBSTONES, empty);
    return empty;
  },

  saveTombstones(tombstones: TombstoneMap): void {
    setItem(STORAGE_KEYS.TOMBSTONES, tombstones);
    inventoryVersion++;
  },

  ensureInitialized(): void {
    // 1. Users: Chỉ giữ tài khoản Admin gốc làm điểm tựa ban đầu; mọi tài khoản khác đồng bộ từ Server
    if (!memoryCache.has(STORAGE_KEYS.USERS) && localStorage.getItem(STORAGE_KEYS.USERS) === null) {
      setItem(STORAGE_KEYS.USERS, [ROOT_ADMIN_USER]);
    }

    // 2. Warehouses: Khởi tạo mảng rỗng trên thiết bị mới để nhận 100% dữ liệu thực từ Server (không đẩy dữ liệu mẫu ảo)
    if (!memoryCache.has(STORAGE_KEYS.WAREHOUSES) && localStorage.getItem(STORAGE_KEYS.WAREHOUSES) === null) {
      setItem(STORAGE_KEYS.WAREHOUSES, []);
    }

    // 3. Materials
    if (!memoryCache.has(STORAGE_KEYS.MATERIALS) && localStorage.getItem(STORAGE_KEYS.MATERIALS) === null) {
      setItem(STORAGE_KEYS.MATERIALS, []);
    }

    // 4. Inbound Receipts
    if (!memoryCache.has(STORAGE_KEYS.INBOUND) && localStorage.getItem(STORAGE_KEYS.INBOUND) === null) {
      setItem(STORAGE_KEYS.INBOUND, []);
    }

    // 5. Outbound Receipts
    if (!memoryCache.has(STORAGE_KEYS.OUTBOUND) && localStorage.getItem(STORAGE_KEYS.OUTBOUND) === null) {
      setItem(STORAGE_KEYS.OUTBOUND, []);
    }

    try {
      localStorage.setItem(SEED_FLAG_KEY, 'true');
    } catch {
      // ignore
    }
  },

  // USERS
  getUsers(): User[] {
    this.ensureInitialized();
    const users = getItem<User[]>(STORAGE_KEYS.USERS, []);
    const hasAdmin = users.some(
      (u) => u.username.toLowerCase() === 'võ dương phú' || u.username.toLowerCase() === 'vo duong phu'
    );
    if (!hasAdmin && users.length === 0) {
      const next = [ROOT_ADMIN_USER, ...users];
      setItem(STORAGE_KEYS.USERS, next);
      return next;
    }
    return users;
  },

  saveUsers(users: User[]): void {
    setItem(STORAGE_KEYS.USERS, users);
  },

  addUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const now = Date.now();
    const newUser: User = {
      ...user,
      id: `user-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(now).toISOString(),
      updatedAt: now
    };
    const tombstones = this.getTombstones();
    const merged = mergeUsersAdditive(this.getUsers(), [newUser], tombstones.users);
    this.saveUsers(merged.list);
    notifySubscribers();
    emitLocalMutation('meta');
    return newUser;
  },

  updateUser(id: string, updates: Partial<User>): User | null {
    const users = [...this.getUsers()];
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updates, updatedAt: Date.now() };
    this.saveUsers(users);
    notifySubscribers();
    emitLocalMutation('meta');
    return users[index];
  },

  deleteUser(id: string): boolean {
    const users = this.getUsers();
    const target = users.find((u) => u.id === id);
    if (target && (target.username === 'Võ Dương Phú' || target.id === 'user-admin-01')) {
      return false;
    }
    const now = Date.now();
    const tombstones = this.getTombstones();
    tombstones.users[id] = now;
    if (target) {
      tombstones.users[normUserKey(target.username)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = users.filter((u) => u.id !== id);
    this.saveUsers(filtered);
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  resetPassword(userId: string, newPass: string): boolean {
    const users = [...this.getUsers()];
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return false;
    users[idx] = { ...users[idx], password: newPass, updatedAt: Date.now() };
    this.saveUsers(users);
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  // WAREHOUSES
  getWarehouses(): Warehouse[] {
    this.ensureInitialized();
    const tombstones = this.getTombstones();
    const whs = getItem<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, []);
    return whs.filter((w) => !isRecordDeleted(tombstones.warehouses, [w.id, normKey(w.code)], w.updatedAt));
  },

  saveWarehouses(whs: Warehouse[]): void {
    setItem(STORAGE_KEYS.WAREHOUSES, whs);
  },

  addWarehouse(wh: Omit<Warehouse, 'id' | 'createdAt'>): Warehouse {
    const now = Date.now();
    const newWh: Warehouse = {
      ...wh,
      id: `wh-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(now).toISOString(),
      updatedAt: now
    };
    const tombstones = this.getTombstones();
    const merged = mergeWarehousesAdditive(this.getWarehouses(), [newWh], tombstones.warehouses);
    this.saveWarehouses(merged.list);
    notifySubscribers();
    emitLocalMutation('meta');
    return newWh;
  },

  updateWarehouse(id: string, updates: Partial<Warehouse>): Warehouse | null {
    const whs = [...this.getWarehouses()];
    const idx = whs.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    whs[idx] = { ...whs[idx], ...updates, updatedAt: Date.now() };
    this.saveWarehouses(whs);
    notifySubscribers();
    emitLocalMutation('meta');
    return whs[idx];
  },

  deleteWarehouse(id: string): boolean {
    const whs = this.getWarehouses();
    const target = whs.find((w) => w.id === id);
    const now = Date.now();
    const tombstones = this.getTombstones();
    tombstones.warehouses[id] = now;
    if (target) {
      tombstones.warehouses[normKey(target.code)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = whs.filter((w) => w.id !== id);
    this.saveWarehouses(filtered);
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  // MATERIALS
  getMaterials(): MaterialItem[] {
    this.ensureInitialized();
    const tombstones = this.getTombstones();
    const mats = getItem<MaterialItem[]>(STORAGE_KEYS.MATERIALS, []);
    if (Object.keys(tombstones.materials).length === 0) return mats;
    return mats.filter((m) => !isRecordDeleted(tombstones.materials, [m.id, normKey(m.code)], m.updatedAt));
  },

  saveMaterials(mats: MaterialItem[]): void {
    setItem(STORAGE_KEYS.MATERIALS, mats);
  },

  addMaterial(mat: Omit<MaterialItem, 'id'>): MaterialItem {
    const now = Date.now();
    const newMat: MaterialItem = {
      ...mat,
      id: `mat-${now}-${Math.random().toString(36).slice(2, 6)}`,
      updatedAt: now
    };
    const tombstones = this.getTombstones();
    const merged = mergeMaterialsAdditive(this.getMaterials(), [newMat], tombstones.materials);
    this.saveMaterials(merged.list);
    notifySubscribers();
    emitLocalMutation('materials');
    return newMat;
  },

  updateMaterial(id: string, updates: Partial<MaterialItem>): MaterialItem | null {
    const mats = [...this.getMaterials()];
    const idx = mats.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    mats[idx] = { ...mats[idx], ...updates, updatedAt: Date.now() };
    this.saveMaterials(mats);
    notifySubscribers();
    emitLocalMutation('materials');
    return mats[idx];
  },

  deleteMaterial(id: string): boolean {
    const mats = this.getMaterials();
    const target = mats.find((m) => m.id === id);
    const now = Date.now();
    const tombstones = this.getTombstones();
    tombstones.materials[id] = now;
    if (target) {
      tombstones.materials[normKey(target.code)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = mats.filter((m) => m.id !== id);
    this.saveMaterials(filtered);
    notifySubscribers();
    emitLocalMutation('materials');
    return true;
  },

  deleteMaterials(ids: string[]): number {
    const idSet = new Set(ids);
    const mats = this.getMaterials();
    const now = Date.now();
    const tombstones = this.getTombstones();
    const filtered: MaterialItem[] = [];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (idSet.has(m.id)) {
        tombstones.materials[m.id] = now;
        tombstones.materials[normKey(m.code)] = now;
      } else {
        filtered.push(m);
      }
    }
    const deletedCount = mats.length - filtered.length;
    if (deletedCount > 0) {
      this.saveTombstones(tombstones);
      this.saveMaterials(filtered);
      notifySubscribers();
      emitLocalMutation('materials');
    }
    return deletedCount;
  },

  deleteAllMaterials(): number {
    const mats = this.getMaterials();
    const count = mats.length;
    if (count > 0) {
      const now = Date.now();
      const tombstones = this.getTombstones();
      for (let i = 0; i < mats.length; i++) {
        tombstones.materials[mats[i].id] = now;
        tombstones.materials[normKey(mats[i].code)] = now;
      }
      this.saveTombstones(tombstones);
      this.saveMaterials([]);
      notifySubscribers();
      emitLocalMutation('materials');
    }
    return count;
  },

  // O(N) Import danh mục vật tư cộng gộp dùng Map thay vì ghi đè toàn bộ
  importMaterials(imported: Partial<MaterialItem>[], mode: 'upsert' | 'skip' = 'upsert'): { added: number; updated: number } {
    const materials = [...this.getMaterials()];
    const codeIndexMap = new Map<string, number>();
    for (let i = 0; i < materials.length; i++) {
      codeIndexMap.set(materials[i].code.toUpperCase(), i);
    }

    let added = 0;
    let updated = 0;
    const baseTs = Date.now();
    const salt = Math.random().toString(36).slice(2, 6);

    for (let i = 0; i < imported.length; i++) {
      const item = imported[i];
      const trimmedCode = (item.code || '').trim().toUpperCase();
      const trimmedName = (item.name || '').trim();
      if (!trimmedCode && !trimmedName) continue;

      const code = trimmedCode || `VT-${trimmedName.slice(0, 6).toUpperCase().replace(/\s+/g, '')}`;
      const existingIdx = codeIndexMap.get(code);

      if (existingIdx !== undefined) {
        if (mode === 'upsert') {
          const prev = materials[existingIdx];
          materials[existingIdx] = {
            ...prev,
            name: trimmedName || prev.name,
            unit: (item.unit || '').trim() || prev.unit || 'Bộ',
            category: (item.category || '').trim() || prev.category || 'Chung',
            packageNo: (item.packageNo || '').trim() || prev.packageNo || '',
            drawingNo: (item.drawingNo || '').trim() || prev.drawingNo || '',
            manufacturer: (item.manufacturer || '').trim() || prev.manufacturer || '',
            supplier: (item.supplier || '').trim() || prev.supplier || '',
            unitWeightKg: item.unitWeightKg !== undefined && !isNaN(Number(item.unitWeightKg)) ? Number(item.unitWeightKg) : prev.unitWeightKg,
            specification: (item.specification || '').trim() || prev.specification || '',
            minStockAlert: item.minStockAlert !== undefined && !isNaN(Number(item.minStockAlert)) ? Number(item.minStockAlert) : prev.minStockAlert,
            notes: (item.notes || '').trim() || prev.notes || '',
            updatedAt: baseTs
          };
          updated++;
        }
      } else {
        const newIdx = materials.length;
        materials.push({
          id: `mat-${baseTs}-${salt}-${i}`,
          code,
          name: trimmedName || code,
          unit: (item.unit || '').trim() || 'Bộ',
          category: (item.category || '').trim() || 'Chung',
          packageNo: (item.packageNo || '').trim() || '',
          drawingNo: (item.drawingNo || '').trim() || '',
          manufacturer: (item.manufacturer || '').trim() || '',
          supplier: (item.supplier || '').trim() || '',
          unitWeightKg: Number(item.unitWeightKg) || 0,
          specification: (item.specification || '').trim() || '',
          minStockAlert: Number(item.minStockAlert) || 0,
          notes: (item.notes || '').trim() || '',
          updatedAt: baseTs
        });
        codeIndexMap.set(code, newIdx);
        added++;
      }
    }

    this.saveMaterials(materials);
    notifySubscribers();
    emitLocalMutation('materials');
    return { added, updated };
  },

  // INBOUND RECEIPTS
  getInboundReceipts(): InboundReceipt[] {
    this.ensureInitialized();
    const inbounds = getItem<InboundReceipt[]>(STORAGE_KEYS.INBOUND, []);
    const tombstones = this.getTombstones();
    if (Object.keys(tombstones.inbound).length === 0) return inbounds;
    return inbounds.filter(
      (r) => !isRecordDeleted(tombstones.inbound, [r.id, normKey(r.receiptCode), r.receiptCode], r.updatedAt)
    );
  },

  saveInboundReceipts(inbounds: InboundReceipt[]): void {
    setItem(STORAGE_KEYS.INBOUND, inbounds);
  },

  addInboundReceipt(rcp: InboundReceipt): void {
    this.addInboundReceipts([rcp]);
  },

  // O(N) thêm & cộng gộp phiếu nhập (không ghi đè mất phiếu cũ) + đồng bộ danh mục vật tư với 100.000+ dòng
  addInboundReceipts(rcps: InboundReceipt[]): { addedCount: number; newMaterialsCount: number } {
    if (rcps.length === 0) return { addedCount: 0, newMaterialsCount: 0 };

    const now = Date.now();
    const stampedRcps = rcps.map((r) => ({ ...r, updatedAt: now }));
    const tombstones = this.getTombstones();
    const existingInbounds = this.getInboundReceipts();
    const mergedIn = mergeInboundReceiptsAdditive(existingInbounds, stampedRcps, tombstones.inbound);
    this.saveInboundReceipts(mergedIn.list);

    // Tự động bổ sung mã vật tư mới vào danh mục bằng Hash Set O(1)
    const currentMaterials = [...this.getMaterials()];
    const existingMatCodes = new Set<string>();
    for (let i = 0; i < currentMaterials.length; i++) {
      existingMatCodes.add(currentMaterials[i].code.toUpperCase());
    }

    let newMaterialsCount = 0;
    const salt = Math.random().toString(36).slice(2, 6);

    for (let rIdx = 0; rIdx < stampedRcps.length; rIdx++) {
      const rcp = stampedRcps[rIdx];
      const items = rcp.items;
      for (let iIdx = 0; iIdx < items.length; iIdx++) {
        const item = items[iIdx];
        const rawCode = (item.materialCode || '').trim();
        const rawName = (item.materialName || '').trim();
        if (!rawCode && !rawName) continue;

        const code = (rawCode || `VT-${rawName.slice(0, 6).toUpperCase().replace(/\s+/g, '')}`).toUpperCase();
        if (!existingMatCodes.has(code)) {
          existingMatCodes.add(code);
          const qty = Number(item.quantity) || 1;
          const weight = Number(item.weightKg) || 0;
          currentMaterials.push({
            id: `mat-auto-${now}-${salt}-${newMaterialsCount}`,
            code,
            name: rawName || code,
            unit: (item.unit || '').trim() || 'Bộ',
            category: (item.category || '').trim() || 'Chung',
            packageNo: (item.packageNo || '').trim() || '',
            drawingNo: (item.drawingNo || '').trim() || '',
            manufacturer: (item.manufacturer || '').trim() || '',
            supplier: (item.supplier || '').trim() || '',
            unitWeightKg: weight && qty ? Math.round((weight / qty) * 100) / 100 : 0,
            specification: item.conditionNote || '',
            minStockAlert: 2,
            notes: `Tự động tạo từ phiếu nhập kho ${rcp.receiptCode} (${item.packingListNo || 'PL'})`,
            updatedAt: now
          });
          newMaterialsCount++;
        }
      }
    }

    if (newMaterialsCount > 0) {
      this.saveMaterials(currentMaterials);
      emitLocalMutation('materials');
    }

    notifySubscribers();
    emitLocalMutation('inbound', mergedIn.touchedCodes);
    return { addedCount: stampedRcps.length, newMaterialsCount };
  },

  deleteInboundReceipt(id: string): boolean {
    const inbounds = this.getInboundReceipts();
    const target = inbounds.find((i) => i.id === id || i.receiptCode === id);
    const now = Date.now();
    const tombstones = this.getTombstones();
    tombstones.inbound[id] = now;
    tombstones.inbound[normKey(id)] = now;
    if (target) {
      tombstones.inbound[target.id] = now;
      tombstones.inbound[normKey(target.receiptCode)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = inbounds.filter((i) => i.id !== id && i.receiptCode !== id);
    this.saveInboundReceipts(filtered);
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  // OUTBOUND RECEIPTS
  getOutboundReceipts(): OutboundReceipt[] {
    this.ensureInitialized();
    const outbounds = getItem<OutboundReceipt[]>(STORAGE_KEYS.OUTBOUND, []);
    const tombstones = this.getTombstones();
    if (Object.keys(tombstones.outbound).length === 0) return outbounds;
    return outbounds.filter(
      (o) => !isRecordDeleted(tombstones.outbound, [o.id, normKey(o.issueCode), o.issueCode], o.updatedAt)
    );
  },

  saveOutboundReceipts(outbounds: OutboundReceipt[]): void {
    setItem(STORAGE_KEYS.OUTBOUND, outbounds);
  },

  addOutboundReceipt(rcp: OutboundReceipt): void {
    this.addOutboundReceipts([rcp]);
  },

  addOutboundReceipts(rcps: OutboundReceipt[]): { addedCount: number } {
    if (rcps.length === 0) return { addedCount: 0 };

    const now = Date.now();
    const stampedRcps = rcps.map((r) => ({ ...r, updatedAt: now }));
    const tombstones = this.getTombstones();
    const existingOutbounds = this.getOutboundReceipts();
    const mergedOut = mergeOutboundReceiptsAdditive(existingOutbounds, stampedRcps, tombstones.outbound);
    this.saveOutboundReceipts(mergedOut.list);

    notifySubscribers();
    emitLocalMutation('outbound', mergedOut.touchedCodes);
    return { addedCount: stampedRcps.length };
  },

  deleteOutboundReceipt(id: string): boolean {
    const outbounds = this.getOutboundReceipts();
    const target = outbounds.find((o) => o.id === id || o.issueCode === id);
    const now = Date.now();
    const tombstones = this.getTombstones();
    tombstones.outbound[id] = now;
    tombstones.outbound[normKey(id)] = now;
    if (target) {
      tombstones.outbound[target.id] = now;
      tombstones.outbound[normKey(target.issueCode)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = outbounds.filter((o) => o.id !== id && o.issueCode !== id);
    this.saveOutboundReceipts(filtered);
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  // ==========================================================================
  // REMOTE SYNC MERGE HANDLERS (Chỉ cộng gộp dữ liệu từ Server, KHÔNG phát ngược emitLocalMutation)
  // ==========================================================================
  applyRemoteMeta(payload: {
    users?: User[];
    warehouses?: Warehouse[];
    tombstones?: Partial<TombstoneMap>;
  }): boolean {
    let anyChanged = false;
    const tombstones = this.getTombstones();

    if (payload.tombstones && mergeTombstones(tombstones, payload.tombstones)) {
      this.saveTombstones(tombstones);
      anyChanged = true;

      // Dọn dẹp các bản ghi đã bị xóa chủ động theo tombstones
      const cleanIn = mergeInboundReceiptsAdditive(
        getItem<InboundReceipt[]>(STORAGE_KEYS.INBOUND, []),
        [],
        tombstones.inbound
      );
      if (cleanIn.changed) {
        this.saveInboundReceipts(cleanIn.list);
      }

      const cleanOut = mergeOutboundReceiptsAdditive(
        getItem<OutboundReceipt[]>(STORAGE_KEYS.OUTBOUND, []),
        [],
        tombstones.outbound
      );
      if (cleanOut.changed) {
        this.saveOutboundReceipts(cleanOut.list);
      }

      const cleanMat = mergeMaterialsAdditive(
        getItem<MaterialItem[]>(STORAGE_KEYS.MATERIALS, []),
        [],
        tombstones.materials
      );
      if (cleanMat.changed) {
        this.saveMaterials(cleanMat.list);
      }
    }

    if (Array.isArray(payload.users) && payload.users.length > 0) {
      const mergedU = mergeUsersAdditive(this.getUsers(), payload.users, tombstones.users);
      if (mergedU.changed) {
        this.saveUsers(mergedU.list);
        anyChanged = true;
      }
    }

    if (Array.isArray(payload.warehouses) && payload.warehouses.length > 0) {
      const mergedW = mergeWarehousesAdditive(this.getWarehouses(), payload.warehouses, tombstones.warehouses);
      if (mergedW.changed) {
        this.saveWarehouses(mergedW.list);
        anyChanged = true;
      }
    }

    if (anyChanged) {
      inventoryVersion++;
      notifySubscribers();
    }
    return anyChanged;
  },

  applyRemoteMaterials(items: MaterialItem[], remoteMatTombstones?: Record<string, number>): boolean {
    const tombstones = this.getTombstones();
    let changed = false;

    if (remoteMatTombstones && mergeTombstones(tombstones, { materials: remoteMatTombstones })) {
      this.saveTombstones(tombstones);
      changed = true;
    }

    if (Array.isArray(items) && items.length > 0) {
      const merged = mergeMaterialsAdditive(this.getMaterials(), items, tombstones.materials);
      if (merged.changed) {
        this.saveMaterials(merged.list);
        changed = true;
      }
    }

    if (changed) {
      notifySubscribers();
    }
    return changed;
  },

  applyRemoteInboundReceipts(receipts: InboundReceipt[]): boolean {
    if (!Array.isArray(receipts) || receipts.length === 0) return false;
    const tombstones = this.getTombstones();
    const merged = mergeInboundReceiptsAdditive(this.getInboundReceipts(), receipts, tombstones.inbound);
    if (merged.changed) {
      this.saveInboundReceipts(merged.list);
      inventoryVersion++;
      notifySubscribers();
      return true;
    }
    return false;
  },

  applyRemoteOutboundReceipts(receipts: OutboundReceipt[]): boolean {
    if (!Array.isArray(receipts) || receipts.length === 0) return false;
    const tombstones = this.getTombstones();
    const merged = mergeOutboundReceiptsAdditive(this.getOutboundReceipts(), receipts, tombstones.outbound);
    if (merged.changed) {
      this.saveOutboundReceipts(merged.list);
      inventoryVersion++;
      notifySubscribers();
      return true;
    }
    return false;
  },

  // Đảm bảo cache tồn kho gốc luôn mới nhất (O(1) nếu dữ liệu không đổi)
  ensureBaseInventoryCache(): InventoryStockRecord[] {
    if (cachedBaseVersion === inventoryVersion) {
      return cachedBaseRecords;
    }

    const inbounds = this.getInboundReceipts();
    const outbounds = this.getOutboundReceipts();
    const warehouses = this.getWarehouses();

    const whMap = new Map<string, string>();
    for (let i = 0; i < warehouses.length; i++) {
      whMap.set(warehouses[i].id, warehouses[i].name);
    }

    const records = buildAggregatedRecords(inbounds, outbounds, whMap);

    // Precompute filter options (giới hạn 150 gợi ý mỗi loại cho datalist để không gây lag DOM)
    const plSet = new Set<string>();
    const shpSet = new Set<string>();
    const makerSet = new Set<string>();
    const supSet = new Set<string>();
    const catSet = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.packingListNo && r.packingListNo !== 'N/A') plSet.add(r.packingListNo);
      if (r.shipment && r.shipment !== 'N/A') shpSet.add(r.shipment);
      if (r.manufacturer && r.manufacturer !== 'N/A') makerSet.add(r.manufacturer);
      if (r.supplier && r.supplier !== 'N/A') supSet.add(r.supplier);
      if (r.category && r.category !== 'N/A') catSet.add(r.category);
    }

    const takeFirst = (set: Set<string>, limit: number): string[] => {
      const out: string[] = [];
      for (const val of set) {
        out.push(val);
        if (out.length >= limit) break;
      }
      return out;
    };

    cachedBaseRecords = records;
    cachedFilterOptions = {
      availablePLs: takeFirst(plSet, 150),
      availableShipments: takeFirst(shpSet, 150),
      availableMakers: takeFirst(makerSet, 150),
      availableSuppliers: takeFirst(supSet, 150),
      availableCategories: takeFirst(catSet, 150),
      totalPLCount: plSet.size,
      totalShipmentCount: shpSet.size
    };
    cachedBaseVersion = inventoryVersion;

    return cachedBaseRecords;
  },

  getInventoryFilterOptions() {
    this.ensureBaseInventoryCache();
    return cachedFilterOptions;
  },

  // TÍNH TOÁN TỒN KHO & BÁO CÁO NHẬP - XUẤT - TỒN (NXT) TỐI ƯU CHO 100.000+ DÒNG
  calculateInventoryRecords(filter?: StockFilterParams): InventoryStockRecord[] {
    let baseRecords: InventoryStockRecord[];

    if (filter?.startDate || filter?.endDate) {
      const inbounds = this.getInboundReceipts();
      const outbounds = this.getOutboundReceipts();
      const warehouses = this.getWarehouses();
      const whMap = new Map<string, string>();
      for (let i = 0; i < warehouses.length; i++) {
        whMap.set(warehouses[i].id, warehouses[i].name);
      }
      baseRecords = buildAggregatedRecords(inbounds, outbounds, whMap, filter.startDate, filter.endDate);
    } else {
      baseRecords = this.ensureBaseInventoryCache();
    }

    if (!filter) return baseRecords;

    const whId = filter.warehouseId && filter.warehouseId !== 'all' ? filter.warehouseId : '';
    const plQ = filter.packingListNo && filter.packingListNo !== 'all' ? filter.packingListNo.toLowerCase().trim() : '';
    const shpQ = filter.shipment && filter.shipment !== 'all' ? filter.shipment.toLowerCase().trim() : '';
    const makerQ = filter.manufacturer && filter.manufacturer !== 'all' ? filter.manufacturer.toLowerCase().trim() : '';
    const supQ = filter.supplier && filter.supplier !== 'all' ? filter.supplier.toLowerCase().trim() : '';
    const pkgNoQ = filter.packageNo && filter.packageNo !== 'all' ? filter.packageNo.toLowerCase().trim() : '';
    const pkgNameQ = filter.packageName && filter.packageName !== 'all' ? filter.packageName.toLowerCase().trim() : '';
    const catQ = filter.category && filter.category !== 'all' ? filter.category.toLowerCase().trim() : '';
    const dwgQ = filter.drawingNo && filter.drawingNo !== 'all' ? filter.drawingNo.toLowerCase().trim() : '';
    const searchQ = filter.searchQuery ? filter.searchQuery.toLowerCase().trim() : '';

    if (!whId && !plQ && !shpQ && !makerQ && !supQ && !pkgNoQ && !pkgNameQ && !catQ && !dwgQ && !searchQ) {
      return baseRecords;
    }

    const result: InventoryStockRecord[] = [];
    for (let i = 0; i < baseRecords.length; i++) {
      const r = baseRecords[i];
      if (whId && r.warehouseId !== whId) continue;
      if (plQ && !r.packingListNo.toLowerCase().includes(plQ)) continue;
      if (shpQ && !r.shipment.toLowerCase().includes(shpQ)) continue;
      if (makerQ && !r.manufacturer.toLowerCase().includes(makerQ)) continue;
      if (supQ && !r.supplier.toLowerCase().includes(supQ)) continue;
      if (pkgNoQ && !r.packageNo.toLowerCase().includes(pkgNoQ)) continue;
      if (pkgNameQ && !r.packageName.toLowerCase().includes(pkgNameQ)) continue;
      if (catQ && !r.category.toLowerCase().includes(catQ)) continue;
      if (dwgQ && !r.drawingNo.toLowerCase().includes(dwgQ)) continue;
      if (searchQ) {
        const hit =
          r.materialName.toLowerCase().includes(searchQ) ||
          r.materialCode.toLowerCase().includes(searchQ) ||
          r.packingListNo.toLowerCase().includes(searchQ) ||
          r.shipment.toLowerCase().includes(searchQ) ||
          r.packageName.toLowerCase().includes(searchQ) ||
          r.packageNo.toLowerCase().includes(searchQ) ||
          r.drawingNo.toLowerCase().includes(searchQ) ||
          r.category.toLowerCase().includes(searchQ) ||
          r.manufacturer.toLowerCase().includes(searchQ) ||
          r.supplier.toLowerCase().includes(searchQ);
        if (!hit) continue;
      }
      result.push(r);
    }

    return result;
  },

  // Reset về dữ liệu gốc (cả IndexedDB và localStorage)
  async resetToDefault(): Promise<void> {
    memoryCache.clear();
    await idbClear();
    try {
      localStorage.removeItem(SEED_FLAG_KEY);
      Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    } catch {
      // ignore
    }
    this.ensureInitialized();
    await this.flush();
    inventoryVersion++;
  }
};
