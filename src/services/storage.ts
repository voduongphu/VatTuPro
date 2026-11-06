import { 
  User, 
  Warehouse, 
  MaterialItem, 
  InboundReceipt, 
  OutboundReceipt, 
  InventoryStockRecord,
  StockFilterParams,
  OsdReceipt,
  OsdStatus,
  TombstoneMap
} from '../types/inventory';
import {
  createEmptyTombstones,
  normKey,
  normUserKey,
  computeEmailAuthDigest,
  isBootstrappedAdminUser,
  roundQty,
  sumInboundItems,
  sumOutboundItems,
  mergeTombstones,
  isRecordDeleted,
  mergeUsersAdditive,
  mergeWarehousesAdditive,
  mergeMaterialsAdditive,
  mergeInboundReceiptsAdditive,
  mergeOutboundReceiptsAdditive,
  mergeOsdReceiptsAdditive,
  buildLatestMaterialsFromReceipts
} from '../utils/additiveMerge';

const STORAGE_KEYS = {
  USERS: 'vtp_inventory_users_v2',
  WAREHOUSES: 'vtp_inventory_warehouses_v2',
  MATERIALS: 'vtp_inventory_materials_v2',
  INBOUND: 'vtp_inventory_inbound_v2',
  OUTBOUND: 'vtp_inventory_outbound_v2',
  OSD: 'vtp_inventory_osd_v2',
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
  STORAGE_KEYS.MATERIALS,
  STORAGE_KEYS.OSD
]);

const SEED_FLAG_KEY = 'vtp_inventory_seeded_flag_v4';
const AUTO_MAT_SYNC_BASELINE_KEY = 'vtp_mat_receipt_autosync_v1';
const IDB_NAME = 'vtp_inventory_idb_v2';
const IDB_STORE = 'kv_store';
const IDB_VERSION = 1;
let bootBaselineStartedAtMs = 0;

function isAutoSyncedMaterialNote(notes?: string): boolean {
  if (!notes) return false;
  const trimmed = notes.trim();
  return (
    trimmed.startsWith('Đồng bộ từ ') ||
    trimmed.startsWith('Tự động tạo ')
  );
}

// Tài khoản Quản trị gốc mặc định khi hệ thống khởi tạo lần đầu
const ROOT_ADMIN_USER: User = {
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

function safeLocalGetRaw(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ============================================================================
// High-Performance In-Memory Cache + IndexedDB Persistence Engine (100k+ rows)
// ============================================================================
const memoryCache = new Map<string, any>();
let idbPromise: Promise<IDBDatabase | null> | null = null;
let initPromise: Promise<void> | null = null;
let isHydrated = false;
let pendingWrites = new Set<Promise<void>>();

export type LocalMutationKind = 'meta' | 'materials' | 'inbound' | 'outbound' | 'osd';
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
let cachedMergedReportVersion = -1;
let cachedMergedReportRecords: InventoryStockRecord[] = [];
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
    const raw = safeLocalGetRaw(key);
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
    key === STORAGE_KEYS.OSD ||
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
  warehouseNames?: Set<string>;
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
  returnInboundQuantity: number;
  returnInboundWeightKg: number;
  outboundQuantity: number;
  outboundWeightKg: number;
  transferOutboundQuantity: number;
  transferOutboundWeightKg: number;
  lastUpdated: string;
}

function cleanStockDisplayValue(raw: string | undefined | null, fallback = 'N/A'): string {
  if (!raw) return fallback;
  const trimmed = String(raw).normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!trimmed) return fallback;
  const upper = trimmed.toUpperCase();
  if (upper === 'N/A' || upper === 'NA' || upper === '-' || upper === '--') {
    return fallback;
  }
  return trimmed;
}

function normStockKeyPart(raw: string | undefined | null): string {
  const cleaned = cleanStockDisplayValue(raw, 'N/A');
  return cleaned === 'N/A' ? 'N/A' : cleaned.toUpperCase();
}

function buildPackageMergeKey(
  packageNo?: string | null,
  packageName?: string | null,
  batchCode?: string | null
): string {
  const resolvedPkgNo = cleanStockDisplayValue(packageNo, 'N/A');
  const effectivePkgNo =
    resolvedPkgNo !== 'N/A' ? resolvedPkgNo : cleanStockDisplayValue(batchCode, 'N/A');
  if (effectivePkgNo !== 'N/A') {
    return effectivePkgNo.toUpperCase();
  }
  const cleanedPkgName = cleanStockDisplayValue(packageName, '');
  if (cleanedPkgName) {
    return `PKGNAME:${cleanedPkgName.toUpperCase()}`;
  }
  return 'N/A';
}

function isMeaningfulMetaValue(
  val: string | undefined | null,
  genericPlaceholders?: string[]
): boolean {
  const cleaned = cleanStockDisplayValue(val, '');
  if (!cleaned) return false;
  const upper = cleaned.toUpperCase();
  if (upper === 'ĐANG CẬP NHẬT') return false;
  if (genericPlaceholders) {
    for (let i = 0; i < genericPlaceholders.length; i++) {
      if (upper === genericPlaceholders[i]) return false;
    }
  }
  return true;
}

function isAutoGeneratedPackageName(packageName: string, packageNo: string): boolean {
  if (!packageName) return true;
  const normName = packageName.normalize('NFC').trim().toUpperCase();
  const normNo = packageNo.normalize('NFC').trim().toUpperCase();
  return normName === `KIỆN ${normNo}` || normName === normNo;
}

function mergeAggMetadata(
  entry: AggEntry,
  incoming: {
    materialCode: string;
    materialName: string;
    unit: string;
    packingListNo: string;
    shipment: string;
    packageNo: string;
    packageName: string;
    category: string;
    drawingNo: string;
    manufacturer: string;
    supplier: string;
    date: string;
  }
): void {
  const isNewerOrSame = incoming.date >= entry.lastUpdated;

  if (incoming.packageNo !== 'N/A' && entry.packageNo === 'N/A') {
    entry.packageNo = incoming.packageNo;
  }

  if (incoming.packageName) {
    const incomingAuto = isAutoGeneratedPackageName(incoming.packageName, entry.packageNo);
    const existingAuto = isAutoGeneratedPackageName(entry.packageName, entry.packageNo);
    if (!entry.packageName || (existingAuto && !incomingAuto) || (isNewerOrSame && !incomingAuto)) {
      entry.packageName = incoming.packageName;
    }
  }

  if (isMeaningfulMetaValue(incoming.unit)) {
    if (!isMeaningfulMetaValue(entry.unit, ['BỘ']) || isNewerOrSame) {
      entry.unit = incoming.unit;
    }
  }

  if (isMeaningfulMetaValue(incoming.category, ['CHUNG'])) {
    if (!isMeaningfulMetaValue(entry.category, ['CHUNG']) || isNewerOrSame) {
      entry.category = incoming.category;
    }
  } else if (entry.category === 'N/A' && incoming.category !== 'N/A') {
    entry.category = incoming.category;
  }

  if (isMeaningfulMetaValue(incoming.drawingNo)) {
    if (!isMeaningfulMetaValue(entry.drawingNo) || isNewerOrSame) {
      entry.drawingNo = incoming.drawingNo;
    }
  }

  if (isMeaningfulMetaValue(incoming.manufacturer)) {
    if (!isMeaningfulMetaValue(entry.manufacturer) || isNewerOrSame) {
      entry.manufacturer = incoming.manufacturer;
    }
  } else if (entry.manufacturer === 'N/A' && incoming.manufacturer !== 'N/A') {
    entry.manufacturer = incoming.manufacturer;
  }

  if (isMeaningfulMetaValue(incoming.supplier)) {
    if (!isMeaningfulMetaValue(entry.supplier) || isNewerOrSame) {
      entry.supplier = incoming.supplier;
    }
  } else if (entry.supplier === 'N/A' && incoming.supplier !== 'N/A') {
    entry.supplier = incoming.supplier;
  }

  if (incoming.packingListNo && incoming.packingListNo !== 'N/A' && !isVoucherCodeLike(incoming.packingListNo)) {
    if (entry.packingListNo === 'N/A' || isVoucherCodeLike(entry.packingListNo)) {
      entry.packingListNo = incoming.packingListNo;
    }
  }
  if (incoming.shipment && incoming.shipment !== 'N/A') {
    if (entry.shipment === 'N/A') {
      entry.shipment = incoming.shipment;
    }
  }

  if (isNewerOrSame) {
    entry.lastUpdated = incoming.date;
    if (incoming.materialName && incoming.materialName !== 'Vật tư' && incoming.materialName !== 'N/A') {
      entry.materialName = incoming.materialName;
    }
  } else if ((entry.materialName === 'Vật tư' || entry.materialName === 'N/A') && incoming.materialName !== 'Vật tư') {
    entry.materialName = incoming.materialName;
  }
}

function isVoucherCodeLike(val?: string | null): boolean {
  if (!val) return false;
  const s = val.trim().toUpperCase();
  return (
    /^PNK\d{2}-/i.test(s) ||
    /^PXK\d{2}-/i.test(s) ||
    /^PNK-/i.test(s) ||
    /^PXK-/i.test(s) ||
    /^OSD\d{2}-/i.test(s) ||
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)
  );
}

function finalizeAggEntries(groupMap: Map<string, AggEntry>): InventoryStockRecord[] {
  const records: InventoryStockRecord[] = new Array(groupMap.size);
  let idx = 0;
  groupMap.forEach((e, key) => {
    const inQty = roundQty(e.inboundQuantity);
    const inWeight = Math.round(e.inboundWeightKg * 100) / 100;
    const retInQty = roundQty(e.returnInboundQuantity);
    const retInWeight = Math.round(e.returnInboundWeightKg * 100) / 100;

    const outQty = roundQty(e.outboundQuantity);
    const outWeight = Math.round(e.outboundWeightKg * 100) / 100;
    const transOutQty = roundQty(e.transferOutboundQuantity);
    const transOutWeight = Math.round(e.transferOutboundWeightKg * 100) / 100;

    // Tổng SL tồn = Tổng SL nhập + Tổng SL nhập trả kho - Tổng SL xuất kho - Tổng SL tái xuất
    const currentQty = roundQty((inQty + retInQty) - (outQty + transOutQty));
    const currentWeight = Math.round(((inWeight + retInWeight) - (outWeight + transOutWeight)) * 100) / 100;

    const warehouseName =
      e.warehouseNames && e.warehouseNames.size > 1
        ? Array.from(e.warehouseNames).join(', ')
        : e.warehouseName;

    records[idx++] = {
      id: key,
      warehouseId: e.warehouseId,
      warehouseName,
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
      inboundQuantity: inQty,
      inboundWeightKg: inWeight,
      returnInboundQuantity: retInQty,
      returnInboundWeightKg: retInWeight,
      outboundQuantity: outQty,
      outboundWeightKg: outWeight,
      transferOutboundQuantity: transOutQty,
      transferOutboundWeightKg: transOutWeight,
      currentQuantity: currentQty,
      currentWeightKg: currentWeight,
      lastUpdated: e.lastUpdated
    };
  });
  return records;
}

function buildAggregatedRecords(
  inbounds: InboundReceipt[],
  outbounds: OutboundReceipt[],
  whMap: Map<string, string>,
  startDate?: string,
  endDate?: string
): InventoryStockRecord[] {
  const groupMap = new Map<string, AggEntry>();

  // Bản đồ tra cứu Packing List & Shipment chuẩn cho từng mã vật tư
  const realPlByItemKey = new Map<string, { pl: string; shp: string }>();
  const realPlByMaterial = new Map<string, { pl: string; shp: string }>();

  // 1. Khởi tạo từ danh mục vật tư
  try {
    const allMaterials = StorageService.getMaterials();
    for (let i = 0; i < allMaterials.length; i++) {
      const m = allMaterials[i];
      const mPl = cleanStockDisplayValue(m.packingListNo, 'N/A');
      const mShp = cleanStockDisplayValue(m.shipment, 'N/A');
      if (mPl !== 'N/A' && !isVoucherCodeLike(mPl)) {
        const codeKey = normKey(m.code);
        if (codeKey) {
          realPlByMaterial.set(codeKey, { pl: mPl, shp: mShp });
        }
      }
    }
  } catch {
    // an toàn nếu chưa nạp storage
  }

  // 2. Tra cứu từ các phiếu nhập mua hàng thực tế (loại trừ phiếu nhập trả kho)
  for (let i = 0; i < inbounds.length; i++) {
    const rcp = inbounds[i];
    if (rcp.inboundType === 'return') continue;
    const rcpCodeUpper = (rcp.receiptCode || '').toUpperCase().trim();
    const items = rcp.items || [];
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      const pl = cleanStockDisplayValue(it.packingListNo, 'N/A');
      const shp = cleanStockDisplayValue(it.shipment, 'N/A');
      if (pl !== 'N/A' && !isVoucherCodeLike(pl) && pl.toUpperCase() !== rcpCodeUpper) {
        const rawPkg = cleanStockDisplayValue(it.packageNo, 'N/A');
        const effPkg = rawPkg !== 'N/A' ? rawPkg : cleanStockDisplayValue(it.batchCode, 'N/A');
        const pkgK = buildPackageMergeKey(effPkg, cleanStockDisplayValue(it.packageName, ''));
        const mK = normKey(it.materialCode);
        const whId = rcp.warehouseId;
        if (mK) {
          realPlByItemKey.set(`${whId}__${mK}__${pkgK}`, { pl, shp });
          realPlByItemKey.set(`${mK}__${pkgK}`, { pl, shp });
          realPlByMaterial.set(mK, { pl, shp });
        }
      }
    }
  }

  const resolveActualPlAndShp = (
    rawPl: string | undefined | null,
    rawShp: string | undefined | null,
    mCode: string,
    pkgKey: string,
    whId: string,
    voucherCode?: string,
    isReturn?: boolean
  ): { pl: string; shp: string } => {
    let cleanPl = cleanStockDisplayValue(rawPl, 'N/A');
    let cleanShp = cleanStockDisplayValue(rawShp, 'N/A');
    const vUpper = (voucherCode || '').toUpperCase().trim();

    const isBadPl =
      cleanPl === 'N/A' ||
      isVoucherCodeLike(cleanPl) ||
      (vUpper && cleanPl.toUpperCase() === vUpper) ||
      Boolean(isReturn && isVoucherCodeLike(cleanPl));

    if (isBadPl) {
      const mK = normKey(mCode);
      const matched =
        realPlByItemKey.get(`${whId}__${mK}__${pkgKey}`) ||
        realPlByItemKey.get(`${mK}__${pkgKey}`) ||
        realPlByMaterial.get(mK);
      if (matched) {
        cleanPl = matched.pl;
        if (cleanShp === 'N/A' && matched.shp !== 'N/A') {
          cleanShp = matched.shp;
        }
      } else {
        cleanPl = 'N/A';
      }
    }
    return { pl: cleanPl, shp: cleanShp };
  };

  for (let i = 0; i < inbounds.length; i++) {
    const receipt = inbounds[i];
    if (startDate && receipt.receiptDate < startDate) continue;
    if (endDate && receipt.receiptDate > endDate) continue;

    const whName = receipt.warehouseName || whMap.get(receipt.warehouseId) || 'Kho mặc định';
    const items = receipt.items;
    const rDate = receipt.receiptDate || '';
    const whId = receipt.warehouseId;
    const isReturn = receipt.inboundType === 'return';

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const rawPkgNo = cleanStockDisplayValue(item.packageNo, 'N/A');
      const dispPkgNo = rawPkgNo !== 'N/A' ? rawPkgNo : cleanStockDisplayValue(item.batchCode, 'N/A');
      const dispPkgName = cleanStockDisplayValue(item.packageName, '');
      const dispCode = cleanStockDisplayValue(item.materialCode, 'N/A');
      const pkgKey = buildPackageMergeKey(dispPkgNo, dispPkgName);

      const resolvedPlShp = resolveActualPlAndShp(
        item.packingListNo,
        item.shipment,
        dispCode,
        pkgKey,
        whId,
        receipt.receiptCode,
        isReturn
      );
      const dispPl = resolvedPlShp.pl;
      const dispShp = resolvedPlShp.shp;

      const dispName = cleanStockDisplayValue(item.materialName, 'Vật tư');
      const dispUnit = cleanStockDisplayValue(item.unit, 'Bộ');
      const dispMaker = cleanStockDisplayValue(item.manufacturer, 'N/A');
      const dispSup = cleanStockDisplayValue(item.supplier, 'N/A');
      const dispCat = cleanStockDisplayValue(item.category, 'N/A');
      const dispDwg = cleanStockDisplayValue(item.drawingNo, 'N/A');

      const plKey = dispPl === 'N/A' ? 'N/A' : dispPl.toUpperCase();
      const shpKey = dispShp === 'N/A' ? 'N/A' : dispShp.toUpperCase();
      const mCodeKey = dispCode === 'N/A' ? 'N/A' : dispCode.toUpperCase();
      const mNameKey = dispName === 'Vật tư' ? 'N/A' : dispName.toUpperCase();
      const key = `${whId}__${plKey}__${shpKey}__${pkgKey}__${mCodeKey}__${mNameKey}`;

      const itemQty = Number(item.quantity) || 0;
      const itemW = Number(item.weightKg) || 0;

      let entry = groupMap.get(key);
      if (!entry) {
        entry = {
          warehouseId: whId,
          warehouseName: whName,
          materialCode: dispCode,
          materialName: dispName,
          unit: dispUnit,
          packingListNo: dispPl,
          shipment: dispShp,
          manufacturer: dispMaker,
          supplier: dispSup,
          packageNo: dispPkgNo,
          packageName: dispPkgName,
          category: dispCat,
          drawingNo: dispDwg,
          inboundQuantity: isReturn ? 0 : itemQty,
          inboundWeightKg: isReturn ? 0 : itemW,
          returnInboundQuantity: isReturn ? itemQty : 0,
          returnInboundWeightKg: isReturn ? itemW : 0,
          outboundQuantity: 0,
          outboundWeightKg: 0,
          transferOutboundQuantity: 0,
          transferOutboundWeightKg: 0,
          lastUpdated: rDate
        };
        groupMap.set(key, entry);
      } else {
        if (isReturn) {
          entry.returnInboundQuantity += itemQty;
          entry.returnInboundWeightKg += itemW;
        } else {
          entry.inboundQuantity += itemQty;
          entry.inboundWeightKg += itemW;
        }
        mergeAggMetadata(entry, {
          materialCode: dispCode,
          materialName: dispName,
          unit: dispUnit,
          packingListNo: dispPl,
          shipment: dispShp,
          packageNo: dispPkgNo,
          packageName: dispPkgName,
          category: dispCat,
          drawingNo: dispDwg,
          manufacturer: dispMaker,
          supplier: dispSup,
          date: rDate
        });
      }
    }
  }

  for (let i = 0; i < outbounds.length; i++) {
    const receipt = outbounds[i];
    if (startDate && receipt.issueDate < startDate) continue;
    if (endDate && receipt.issueDate > endDate) continue;

    const whName = receipt.warehouseName || whMap.get(receipt.warehouseId) || 'Kho mặc định';
    const items = receipt.items;
    const iDate = receipt.issueDate || '';
    const whId = receipt.warehouseId;
    const isTransfer = receipt.outboundType === 'transfer';

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const rawPkgNo = cleanStockDisplayValue(item.packageNo, 'N/A');
      const dispPkgNo = rawPkgNo !== 'N/A' ? rawPkgNo : cleanStockDisplayValue(item.batchCode, 'N/A');
      const dispPkgName = cleanStockDisplayValue(item.packageName, '');
      const dispCode = cleanStockDisplayValue(item.materialCode, 'N/A');
      const pkgKey = buildPackageMergeKey(dispPkgNo, dispPkgName);

      const resolvedPlShp = resolveActualPlAndShp(
        item.packingListNo,
        item.shipment,
        dispCode,
        pkgKey,
        whId,
        receipt.issueCode,
        false
      );
      const dispPl = resolvedPlShp.pl;
      const dispShp = resolvedPlShp.shp;
      const dispName = cleanStockDisplayValue(item.materialName, 'Vật tư');
      const dispUnit = cleanStockDisplayValue(item.unit, 'Bộ');
      const dispMaker = cleanStockDisplayValue(item.manufacturer, 'N/A');
      const dispSup = cleanStockDisplayValue(item.supplier, 'N/A');
      const dispCat = cleanStockDisplayValue(item.category, 'N/A');
      const dispDwg = cleanStockDisplayValue(item.drawingNo, 'N/A');

      const plKey = dispPl === 'N/A' ? 'N/A' : dispPl.toUpperCase();
      const shpKey = dispShp === 'N/A' ? 'N/A' : dispShp.toUpperCase();
      const mCodeKey = dispCode === 'N/A' ? 'N/A' : dispCode.toUpperCase();
      const mNameKey = dispName === 'Vật tư' ? 'N/A' : dispName.toUpperCase();
      const key = `${whId}__${plKey}__${shpKey}__${pkgKey}__${mCodeKey}__${mNameKey}`;

      const itemQty = Number(item.quantity) || 0;
      const itemW = Number(item.weightKg) || 0;

      let entry = groupMap.get(key);
      if (!entry) {
        entry = {
          warehouseId: whId,
          warehouseName: whName,
          materialCode: dispCode,
          materialName: dispName,
          unit: dispUnit,
          packingListNo: dispPl,
          shipment: dispShp,
          manufacturer: dispMaker,
          supplier: dispSup,
          packageNo: dispPkgNo,
          packageName: dispPkgName,
          category: dispCat,
          drawingNo: dispDwg,
          inboundQuantity: 0,
          inboundWeightKg: 0,
          returnInboundQuantity: 0,
          returnInboundWeightKg: 0,
          outboundQuantity: isTransfer ? 0 : itemQty,
          outboundWeightKg: isTransfer ? 0 : itemW,
          transferOutboundQuantity: isTransfer ? itemQty : 0,
          transferOutboundWeightKg: isTransfer ? itemW : 0,
          lastUpdated: iDate
        };
        groupMap.set(key, entry);
      } else {
        if (isTransfer) {
          entry.transferOutboundQuantity += itemQty;
          entry.transferOutboundWeightKg += itemW;
        } else {
          entry.outboundQuantity += itemQty;
          entry.outboundWeightKg += itemW;
        }
        mergeAggMetadata(entry, {
          materialCode: dispCode,
          materialName: dispName,
          unit: dispUnit,
          packingListNo: dispPl,
          shipment: dispShp,
          packageNo: dispPkgNo,
          packageName: dispPkgName,
          category: dispCat,
          drawingNo: dispDwg,
          manufacturer: dispMaker,
          supplier: dispSup,
          date: iDate
        });
      }
    }
  }

  return finalizeAggEntries(groupMap);
}

// Gộp các bản ghi trùng 5 trường: Số Packing List + Shipment + Package (Kiện hàng) + Mã vật tư + Tên vật tư
function mergeRecordsForInventoryReport(records: InventoryStockRecord[]): InventoryStockRecord[] {
  const reportMap = new Map<string, AggEntry>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const plKey = normStockKeyPart(r.packingListNo);
    const shpKey = normStockKeyPart(r.shipment);
    const pkgKey = buildPackageMergeKey(r.packageNo, r.packageName);
    const mCodeKey = normStockKeyPart(r.materialCode);
    const mNameKey =
      r.materialName && r.materialName !== 'Vật tư' ? normStockKeyPart(r.materialName) : 'N/A';

    const reportKey = `RPT__${plKey}__${shpKey}__${pkgKey}__${mCodeKey}__${mNameKey}`;

    let entry = reportMap.get(reportKey);
    if (!entry) {
      const whSet = new Set<string>();
      if (r.warehouseName) whSet.add(r.warehouseName);
      entry = {
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        warehouseNames: whSet,
        materialCode: cleanStockDisplayValue(r.materialCode, 'N/A'),
        materialName: cleanStockDisplayValue(r.materialName, 'Vật tư'),
        unit: cleanStockDisplayValue(r.unit, 'Bộ'),
        packingListNo: cleanStockDisplayValue(r.packingListNo, 'N/A'),
        shipment: cleanStockDisplayValue(r.shipment, 'N/A'),
        manufacturer: cleanStockDisplayValue(r.manufacturer, 'N/A'),
        supplier: cleanStockDisplayValue(r.supplier, 'N/A'),
        packageNo: cleanStockDisplayValue(r.packageNo, 'N/A'),
        packageName: cleanStockDisplayValue(r.packageName, ''),
        category: cleanStockDisplayValue(r.category, 'N/A'),
        drawingNo: cleanStockDisplayValue(r.drawingNo, 'N/A'),
        inboundQuantity: r.inboundQuantity,
        inboundWeightKg: r.inboundWeightKg,
        returnInboundQuantity: r.returnInboundQuantity || 0,
        returnInboundWeightKg: r.returnInboundWeightKg || 0,
        outboundQuantity: r.outboundQuantity,
        outboundWeightKg: r.outboundWeightKg,
        transferOutboundQuantity: r.transferOutboundQuantity || 0,
        transferOutboundWeightKg: r.transferOutboundWeightKg || 0,
        lastUpdated: r.lastUpdated || ''
      };
      reportMap.set(reportKey, entry);
    } else {
      entry.inboundQuantity += r.inboundQuantity;
      entry.inboundWeightKg += r.inboundWeightKg;
      entry.returnInboundQuantity += r.returnInboundQuantity || 0;
      entry.returnInboundWeightKg += r.returnInboundWeightKg || 0;
      entry.outboundQuantity += r.outboundQuantity;
      entry.outboundWeightKg += r.outboundWeightKg;
      entry.transferOutboundQuantity += r.transferOutboundQuantity || 0;
      entry.transferOutboundWeightKg += r.transferOutboundWeightKg || 0;

      if (r.warehouseId !== entry.warehouseId) {
        entry.warehouseId = 'merged';
      }
      if (r.warehouseName && entry.warehouseNames) {
        entry.warehouseNames.add(r.warehouseName);
      }
      mergeAggMetadata(entry, {
        materialCode: cleanStockDisplayValue(r.materialCode, 'N/A'),
        materialName: cleanStockDisplayValue(r.materialName, 'Vật tư'),
        unit: cleanStockDisplayValue(r.unit, 'Bộ'),
        packingListNo: cleanStockDisplayValue(r.packingListNo, 'N/A'),
        shipment: cleanStockDisplayValue(r.shipment, 'N/A'),
        packageNo: cleanStockDisplayValue(r.packageNo, 'N/A'),
        packageName: cleanStockDisplayValue(r.packageName, ''),
        category: cleanStockDisplayValue(r.category, 'N/A'),
        drawingNo: cleanStockDisplayValue(r.drawingNo, 'N/A'),
        manufacturer: cleanStockDisplayValue(r.manufacturer, 'N/A'),
        supplier: cleanStockDisplayValue(r.supplier, 'N/A'),
        date: r.lastUpdated || ''
      });
    }
  }

  return finalizeAggEntries(reportMap);
}

function applyStockAttributeFilters(
  baseRecords: InventoryStockRecord[],
  filter?: StockFilterParams,
  skipWarehouseFilter = false
): InventoryStockRecord[] {
  if (!filter) return baseRecords;

  const whId =
    !skipWarehouseFilter && filter.warehouseId && filter.warehouseId !== 'all'
      ? filter.warehouseId
      : '';
  const plQ =
    filter.packingListNo && filter.packingListNo !== 'all'
      ? filter.packingListNo.normalize('NFC').toLowerCase().trim()
      : '';
  const shpQ =
    filter.shipment && filter.shipment !== 'all'
      ? filter.shipment.normalize('NFC').toLowerCase().trim()
      : '';
  const makerQ =
    filter.manufacturer && filter.manufacturer !== 'all'
      ? filter.manufacturer.normalize('NFC').toLowerCase().trim()
      : '';
  const supQ =
    filter.supplier && filter.supplier !== 'all'
      ? filter.supplier.normalize('NFC').toLowerCase().trim()
      : '';
  const pkgNoQ =
    filter.packageNo && filter.packageNo !== 'all'
      ? filter.packageNo.normalize('NFC').toLowerCase().trim()
      : '';
  const pkgNameQ =
    filter.packageName && filter.packageName !== 'all'
      ? filter.packageName.normalize('NFC').toLowerCase().trim()
      : '';
  const catQ =
    filter.category && filter.category !== 'all'
      ? filter.category.normalize('NFC').toLowerCase().trim()
      : '';
  const dwgQ =
    filter.drawingNo && filter.drawingNo !== 'all'
      ? filter.drawingNo.normalize('NFC').toLowerCase().trim()
      : '';
  const searchQ = filter.searchQuery ? filter.searchQuery.normalize('NFC').toLowerCase().trim() : '';

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
      this.syncMaterialsFromReceipts({ emitMutation: false, notify: false });
      inventoryVersion++;
      isHydrated = true;
      notifySubscribers();
    })();

    return initPromise;
  },

  isHydratedReady(): boolean {
    return isHydrated;
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
    // 1. Users: Chỉ giữ tài khoản Admin gốc làm điểm tựa ban đầu; mọi tài khoản khác đồng bộ từ Server / Đám mây
    if (!memoryCache.has(STORAGE_KEYS.USERS) && safeLocalGetRaw(STORAGE_KEYS.USERS) === null) {
      setItem(STORAGE_KEYS.USERS, [ROOT_ADMIN_USER]);
    }

    // 2. Warehouses: Khởi tạo mảng rỗng trên thiết bị mới để nhận 100% dữ liệu thực từ Server (không đẩy dữ liệu mẫu ảo)
    if (!memoryCache.has(STORAGE_KEYS.WAREHOUSES) && safeLocalGetRaw(STORAGE_KEYS.WAREHOUSES) === null) {
      setItem(STORAGE_KEYS.WAREHOUSES, []);
    }

    // 3. Materials
    if (!memoryCache.has(STORAGE_KEYS.MATERIALS) && safeLocalGetRaw(STORAGE_KEYS.MATERIALS) === null) {
      setItem(STORAGE_KEYS.MATERIALS, []);
    }

    // 4. Inbound Receipts
    if (!memoryCache.has(STORAGE_KEYS.INBOUND) && safeLocalGetRaw(STORAGE_KEYS.INBOUND) === null) {
      setItem(STORAGE_KEYS.INBOUND, []);
    }

    // 5. Outbound Receipts
    if (!memoryCache.has(STORAGE_KEYS.OUTBOUND) && safeLocalGetRaw(STORAGE_KEYS.OUTBOUND) === null) {
      setItem(STORAGE_KEYS.OUTBOUND, []);
    }

    // 6. OSD Receipts
    if (!memoryCache.has(STORAGE_KEYS.OSD) && safeLocalGetRaw(STORAGE_KEYS.OSD) === null) {
      setItem(STORAGE_KEYS.OSD, []);
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
    const existingUsers = this.getUsers();
    const maxPrevTs = existingUsers.reduce((acc, u) => Math.max(acc, Number(u.updatedAt) || 0), 0);
    const now = Date.now();
    const monotonicTs = Math.max(now, maxPrevTs + 1);
    const cleanEmail = (user.email || '').trim();
    const cleanPassword = (user.password || '').trim() || '123456';
    const newUser: User = {
      ...user,
      username: user.username.normalize('NFC').trim(),
      fullName: (user.fullName || user.username).normalize('NFC').trim(),
      password: cleanPassword,
      email: cleanEmail,
      emailDigest: computeEmailAuthDigest(cleanEmail) || user.emailDigest,
      id: `user-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(now).toISOString(),
      updatedAt: monotonicTs
    };
    const tombstones = this.getTombstones();
    const uKey = normUserKey(newUser.username);
    const emDigest = newUser.emailDigest || '';
    // Nếu trước đó từng xóa tài khoản trùng username/email rồi tạo mới lại, đảm bảo updatedAt vượt tombstone
    const prevTombTs = Math.max(
      Number(tombstones.users[uKey]) || 0,
      Number(tombstones.users[newUser.id]) || 0,
      emDigest ? Number(tombstones.users[emDigest]) || 0 : 0
    );
    if (prevTombTs >= (newUser.updatedAt || 0)) {
      newUser.updatedAt = prevTombTs + 1;
    }
    const merged = mergeUsersAdditive(existingUsers, [newUser], tombstones.users);
    this.saveUsers(merged.list);
    notifySubscribers();
    emitLocalMutation('meta');
    return newUser;
  },

  upsertGoogleUser(user: User): User {
    const existingUsers = this.getUsers();
    const tombstones = this.getTombstones();
    const uKey = normUserKey(user.username);
    const emDigest = user.emailDigest || computeEmailAuthDigest(user.email) || '';
    const prevTombTs = Math.max(
      Number(tombstones.users[uKey]) || 0,
      Number(tombstones.users[user.id]) || 0,
      emDigest ? Number(tombstones.users[emDigest]) || 0 : 0
    );
    const nextUpdatedAt = Math.max(
      Date.now(),
      Number(user.updatedAt) || 0,
      prevTombTs > 0 ? prevTombTs + 1 : 0
    );
    const cleanUser: User = {
      ...user,
      emailDigest: emDigest || user.emailDigest,
      updatedAt: nextUpdatedAt
    };
    const merged = mergeUsersAdditive(existingUsers, [cleanUser], tombstones.users);
    this.saveUsers(merged.list);
    notifySubscribers();
    emitLocalMutation('meta');
    return (
      merged.list.find(
        (u) =>
          (emDigest && u.emailDigest === emDigest) ||
          u.id === cleanUser.id ||
          normUserKey(u.username) === uKey
      ) || cleanUser
    );
  },

  updateUser(id: string, updates: Partial<User>): User | null {
    const users = [...this.getUsers()];
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    const prev = users[index];
    const isAdminRoot = isBootstrappedAdminUser(prev);
    const nextEmail = isAdminRoot
      ? 'voduongphu@gmail.com'
      : updates.email !== undefined
        ? updates.email.trim().toLowerCase()
        : prev.email;
    const nextEmailDigest =
      computeEmailAuthDigest(nextEmail) || prev.emailDigest || undefined;
    const nextUpdatedAt = Math.max(
      Date.now(),
      (Number(prev.updatedAt) || 0) + 1,
      Number(updates.updatedAt) || 0
    );
    users[index] = {
      ...prev,
      ...updates,
      role: isAdminRoot ? 'admin' : updates.role !== undefined ? updates.role : prev.role,
      isActive: isAdminRoot ? true : updates.isActive !== undefined ? updates.isActive : prev.isActive,
      username: (updates.username !== undefined ? updates.username : prev.username).normalize('NFC').trim(),
      fullName: (updates.fullName !== undefined ? updates.fullName : prev.fullName).normalize('NFC').trim(),
      email: nextEmail,
      emailDigest: nextEmailDigest,
      password: updates.password !== undefined ? updates.password.trim() : prev.password,
      updatedAt: nextUpdatedAt
    };
    this.saveUsers(users);
    notifySubscribers();
    emitLocalMutation('meta');
    return users[index];
  },

  deleteUser(id: string): boolean {
    const users = this.getUsers();
    const target = users.find((u) => u.id === id);
    if (target && isBootstrappedAdminUser(target)) {
      return false;
    }
    const tombTs = Math.max(Date.now(), (Number(target?.updatedAt) || 0) + 1);
    const tombstones = this.getTombstones();
    tombstones.users[id] = tombTs;
    if (target) {
      tombstones.users[normUserKey(target.username)] = tombTs;
      const emDigest = target.emailDigest || computeEmailAuthDigest(target.email);
      if (emDigest) {
        tombstones.users[emDigest] = tombTs;
      }
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
    const prev = users[idx];
    const nextUpdatedAt = Math.max(Date.now(), (Number(prev.updatedAt) || 0) + 1);
    users[idx] = { ...prev, password: newPass.trim(), updatedAt: nextUpdatedAt };
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
    const tombTs = Math.max(Date.now(), (Number(target?.updatedAt) || 0) + 1);
    const tombstones = this.getTombstones();
    tombstones.materials[id] = tombTs;
    if (target) {
      tombstones.materials[normKey(target.code)] = tombTs;
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
        const tombTs = Math.max(now, (Number(m.updatedAt) || 0) + 1);
        tombstones.materials[m.id] = tombTs;
        tombstones.materials[normKey(m.code)] = tombTs;
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
        const tombTs = Math.max(now, (Number(mats[i].updatedAt) || 0) + 1);
        tombstones.materials[mats[i].id] = tombTs;
        tombstones.materials[normKey(mats[i].code)] = tombTs;
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

  // Tự động đồng bộ Danh mục vật tư từ toàn bộ Phiếu nhập & Phiếu xuất (trùng mã lấy dữ liệu mới nhất)
  syncMaterialsFromReceipts(options?: {
    forceFromReceipts?: boolean;
    emitMutation?: boolean;
    notify?: boolean;
  }): { added: number; updated: number; changed: boolean } {
    const inbounds = this.getInboundReceipts();
    const outbounds = this.getOutboundReceipts();
    const hasReceipts = inbounds.length > 0 || outbounds.length > 0;

    let wasBaselineDone = safeLocalGetRaw(AUTO_MAT_SYNC_BASELINE_KEY) === 'true';
    const inBootBaselineWindow =
      bootBaselineStartedAtMs > 0 && Date.now() - bootBaselineStartedAtMs < 15_000;
    const isBaselineRun = (!wasBaselineDone && hasReceipts) || inBootBaselineWindow;
    const forceRefresh = Boolean(options?.forceFromReceipts) || isBaselineRun;

    const rawStoredMaterials = getItem<MaterialItem[]>(STORAGE_KEYS.MATERIALS, []);
    const tombstones = this.getTombstones();

    let maxMatTombTs = 0;
    const matTombValues = Object.values(tombstones.materials);
    for (let i = 0; i < matTombValues.length; i++) {
      const v = Number(matTombValues[i]) || 0;
      if (v > maxMatTombTs) maxMatTombTs = v;
    }

    // Lưu bản ghi thô theo mã để khôi phục ID / tồn kho tối thiểu khi đồng bộ lại
    const rawByCode = new Map<string, MaterialItem>();
    for (let i = 0; i < rawStoredMaterials.length; i++) {
      const m = rawStoredMaterials[i];
      const cKey = normKey(m.code);
      if (!cKey) continue;
      const prev = rawByCode.get(cKey);
      if (!prev || (Number(m.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
        rawByCode.set(cKey, m);
      }
    }

    // Khử trùng lặp ngay trên danh sách vật tư đang hoạt động (giữ bản mới nhất cho mỗi mã)
    const activeRawList = this.getMaterials();
    const dedupedActive: MaterialItem[] = [];
    const activeIndexByCode = new Map<string, number>();
    let changed = false;

    for (let i = 0; i < activeRawList.length; i++) {
      const m = activeRawList[i];
      const cKey = normKey(m.code);
      if (!cKey) {
        changed = true;
        continue;
      }
      const existIdx = activeIndexByCode.get(cKey);
      if (existIdx === undefined) {
        activeIndexByCode.set(cKey, dedupedActive.length);
        dedupedActive.push(m);
      } else {
        changed = true;
        const curr = dedupedActive[existIdx];
        if ((Number(m.updatedAt) || 0) >= (Number(curr.updatedAt) || 0)) {
          dedupedActive[existIdx] = m;
        }
      }
    }

    const candidates = buildLatestMaterialsFromReceipts(inbounds, outbounds);
    let added = 0;
    let updated = 0;
    const now = Date.now();

    candidates.forEach((cand, cKey) => {
      const existIdx = activeIndexByCode.get(cKey);
      const prevRaw = rawByCode.get(cKey);
      const itemTombTs = Math.max(
        Number(tombstones.materials[cKey]) || 0,
        prevRaw?.id ? Number(tombstones.materials[prevRaw.id]) || 0 : 0
      );

      if (existIdx === undefined) {
        if (!forceRefresh && itemTombTs > 0 && itemTombTs >= cand.latestMutationTs) {
          return;
        }
        const nextUpdatedAt = forceRefresh
          ? Math.max(now, maxMatTombTs + 1, cand.latestMutationTs, (Number(prevRaw?.updatedAt) || 0) + 1)
          : Math.max(cand.latestMutationTs, itemTombTs > 0 ? itemTombTs + 1 : 1);

        const preservedCustomNote =
          prevRaw?.notes && !isAutoSyncedMaterialNote(prevRaw.notes) ? prevRaw.notes : '';
        const resolvedNotes = cand.latestItemNote || preservedCustomNote || cand.latestSourceNote;

        const newMat: MaterialItem = {
          id: prevRaw?.id || `mat-auto-${cKey.replace(/[^A-Z0-9_-]/g, '_')}`,
          code: cand.code,
          name: cand.name || cand.code,
          unit: cand.unit || 'Bộ',
          category: cand.category || 'Chung',
          packingListNo: cand.packingListNo || '',
          shipment: cand.shipment || '',
          packageNo: cand.packageNo || '',
          drawingNo: cand.drawingNo || '',
          manufacturer: cand.manufacturer || '',
          supplier: cand.supplier || '',
          unitWeightKg: cand.unitWeightKg || 0,
          specification: cand.specification || '',
          minStockAlert: prevRaw?.minStockAlert ?? 2,
          notes: resolvedNotes,
          updatedAt: nextUpdatedAt
        };
        activeIndexByCode.set(cKey, dedupedActive.length);
        dedupedActive.push(newMat);
        added++;
        changed = true;
      } else {
        const curr = dedupedActive[existIdx];
        const currTs = Number(curr.updatedAt) || 0;
        const currTombTs = Math.max(
          itemTombTs,
          Number(tombstones.materials[curr.id]) || 0
        );
        const isAutoNote = isAutoSyncedMaterialNote(curr.notes);
        const shouldOverwrite = forceRefresh || cand.latestMutationTs >= currTs || isAutoNote;

        if (shouldOverwrite) {
          const nextName = cand.name || curr.name || cand.code;
          const nextUnit = cand.unit || curr.unit || 'Bộ';
          const nextCategory = cand.hasSpecificCategory
            ? cand.category
            : curr.category &&
                curr.category !== 'Chung' &&
                curr.category !== 'Vật tư dự án' &&
                curr.category !== 'Khác'
              ? curr.category
              : cand.category || curr.category || 'Chung';
          const nextPackingListNo = cand.packingListNo || curr.packingListNo || '';
          const nextShipment = cand.shipment || curr.shipment || '';
          const nextPackageNo = cand.packageNo || curr.packageNo || '';
          const nextDrawingNo = cand.drawingNo || curr.drawingNo || '';
          const nextManufacturer = cand.manufacturer || curr.manufacturer || '';
          const nextSupplier = cand.supplier || curr.supplier || '';
          const nextUnitWeightKg =
            cand.unitWeightKg > 0 ? cand.unitWeightKg : Number(curr.unitWeightKg) || 0;
          const nextSpecification = cand.specification || curr.specification || '';
          const nextNotes =
            isAutoNote || !curr.notes
              ? cand.latestItemNote || cand.latestSourceNote
              : curr.notes;

          const needTombBump = forceRefresh && currTombTs >= currTs;
          const fieldsDiff =
            nextName !== curr.name ||
            nextUnit !== curr.unit ||
            nextCategory !== curr.category ||
            nextPackingListNo !== (curr.packingListNo || '') ||
            nextShipment !== (curr.shipment || '') ||
            nextPackageNo !== (curr.packageNo || '') ||
            nextDrawingNo !== (curr.drawingNo || '') ||
            nextManufacturer !== (curr.manufacturer || '') ||
            nextSupplier !== (curr.supplier || '') ||
            nextUnitWeightKg !== (Number(curr.unitWeightKg) || 0) ||
            nextSpecification !== (curr.specification || '') ||
            nextNotes !== (curr.notes || '');

          if (fieldsDiff || needTombBump) {
            const nextUpdatedAt = forceRefresh
              ? Math.max(now, maxMatTombTs + 1, cand.latestMutationTs, currTs + 1)
              : Math.max(cand.latestMutationTs, currTs + 1);
            dedupedActive[existIdx] = {
              ...curr,
              code: cand.code,
              name: nextName,
              unit: nextUnit,
              category: nextCategory,
              packingListNo: nextPackingListNo,
              shipment: nextShipment,
              packageNo: nextPackageNo,
              drawingNo: nextDrawingNo,
              manufacturer: nextManufacturer,
              supplier: nextSupplier,
              unitWeightKg: nextUnitWeightKg,
              specification: nextSpecification,
              notes: nextNotes,
              updatedAt: nextUpdatedAt
            };
            updated++;
            changed = true;
          }
        } else {
          // Trường hợp Admin vừa chỉnh tay danh mục sau ngày lập phiếu: chỉ điền bổ sung các trường đang trống
          const nextPackingListNo = curr.packingListNo || cand.packingListNo || '';
          const nextShipment = curr.shipment || cand.shipment || '';
          const nextPackageNo = curr.packageNo || cand.packageNo || '';
          const nextDrawingNo = curr.drawingNo || cand.drawingNo || '';
          const nextManufacturer = curr.manufacturer || cand.manufacturer || '';
          const nextSupplier = curr.supplier || cand.supplier || '';
          const nextUnitWeightKg =
            Number(curr.unitWeightKg) > 0 ? Number(curr.unitWeightKg) : cand.unitWeightKg || 0;
          const nextSpecification = curr.specification || cand.specification || '';

          if (
            nextPackingListNo !== (curr.packingListNo || '') ||
            nextShipment !== (curr.shipment || '') ||
            nextPackageNo !== (curr.packageNo || '') ||
            nextDrawingNo !== (curr.drawingNo || '') ||
            nextManufacturer !== (curr.manufacturer || '') ||
            nextSupplier !== (curr.supplier || '') ||
            nextUnitWeightKg !== (Number(curr.unitWeightKg) || 0) ||
            nextSpecification !== (curr.specification || '')
          ) {
            dedupedActive[existIdx] = {
              ...curr,
              packingListNo: nextPackingListNo,
              shipment: nextShipment,
              packageNo: nextPackageNo,
              drawingNo: nextDrawingNo,
              manufacturer: nextManufacturer,
              supplier: nextSupplier,
              unitWeightKg: nextUnitWeightKg,
              specification: nextSpecification,
              updatedAt: currTs + 1
            };
            updated++;
            changed = true;
          }
        }
      }
    });

    if (!wasBaselineDone && hasReceipts) {
      bootBaselineStartedAtMs = Date.now();
      try {
        localStorage.setItem(AUTO_MAT_SYNC_BASELINE_KEY, 'true');
      } catch {
        // ignore
      }
      wasBaselineDone = true;
    }

    if (changed) {
      this.saveMaterials(dedupedActive);
      if (options?.notify) {
        notifySubscribers();
      }
      if (options?.emitMutation || isBaselineRun) {
        emitLocalMutation('materials');
      }
    }

    return { added, updated, changed };
  },

  // INBOUND RECEIPTS
  getInboundReceipts(): InboundReceipt[] {
    this.ensureInitialized();
    const inbounds = getItem<InboundReceipt[]>(STORAGE_KEYS.INBOUND, []);
    let repaired = false;
    const normalized = inbounds.map((r) => {
      const items = Array.isArray(r.items) ? r.items : [];
      const sums = sumInboundItems(items);
      if (
        r.totalQuantity !== sums.totalQuantity ||
        r.totalWeightKg !== sums.totalWeightKg ||
        (r.totalAmount ?? 0) !== sums.totalAmount
      ) {
        repaired = true;
        return {
          ...r,
          items,
          packageCount: sums.packageCount,
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          totalAmount: sums.totalAmount
        };
      }
      return r;
    });
    if (repaired) {
      this.saveInboundReceipts(normalized);
    }
    const tombstones = this.getTombstones();
    if (Object.keys(tombstones.inbound).length === 0) return normalized;
    return normalized.filter(
      (r) => !isRecordDeleted(tombstones.inbound, [r.id, normKey(r.receiptCode), r.receiptCode], r.updatedAt)
    );
  },

  saveInboundReceipts(inbounds: InboundReceipt[]): void {
    setItem(STORAGE_KEYS.INBOUND, inbounds);
  },

  addInboundReceipt(rcp: InboundReceipt): void {
    this.addInboundReceipts([rcp]);
  },

  // O(N) thêm & cộng gộp phiếu nhập (không ghi đè mất phiếu cũ) + tự động đồng bộ danh mục vật tư lấy dữ liệu mới nhất
  addInboundReceipts(rcps: InboundReceipt[]): { addedCount: number; newMaterialsCount: number } {
    if (rcps.length === 0) return { addedCount: 0, newMaterialsCount: 0 };

    const now = Date.now();
    const stampedRcps = rcps.map((r) => ({ ...r, updatedAt: now }));
    const tombstones = this.getTombstones();
    const existingInbounds = this.getInboundReceipts();
    const mergedIn = mergeInboundReceiptsAdditive(existingInbounds, stampedRcps, tombstones.inbound);
    this.saveInboundReceipts(mergedIn.list);

    const matSync = this.syncMaterialsFromReceipts({ emitMutation: true });

    notifySubscribers();
    emitLocalMutation('inbound', mergedIn.touchedCodes);
    return { addedCount: stampedRcps.length, newMaterialsCount: matSync.added + matSync.updated };
  },

  updateInboundReceipt(
    originalId: string,
    updated: InboundReceipt
  ): { success: boolean; newMaterialsCount: number } {
    const inbounds = [...this.getInboundReceipts()];
    const idx = inbounds.findIndex((r) => r.id === originalId || normKey(r.receiptCode) === normKey(originalId));
    if (idx === -1) {
      return { success: false, newMaterialsCount: 0 };
    }

    const oldRcp = inbounds[idx];
    const now = Date.now();
    const oldCodeKey = normKey(oldRcp.receiptCode || oldRcp.id);
    const newCodeKey = normKey(updated.receiptCode || updated.id);
    const isCodeChanged = Boolean(oldCodeKey && newCodeKey && oldCodeKey !== newCodeKey);

    const items = Array.isArray(updated.items) ? updated.items : [];
    const sums = sumInboundItems(items);
    const salt = Math.random().toString(36).slice(2, 6);

    if (isCodeChanged) {
      const tombstones = this.getTombstones();
      const delTs = now - 1;
      tombstones.inbound[oldRcp.id] = delTs;
      tombstones.inbound[oldRcp.receiptCode] = delTs;
      tombstones.inbound[oldCodeKey] = delTs;
      this.saveTombstones(tombstones);
    }

    const savedReceipt: InboundReceipt = {
      ...oldRcp,
      ...updated,
      id: isCodeChanged ? `in-rcp-${now}-${salt}` : oldRcp.id,
      items,
      packageCount: sums.packageCount,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      totalAmount: sums.totalAmount,
      updatedAt: now,
      itemsReplacedAt: now
    };

    inbounds[idx] = savedReceipt;
    this.saveInboundReceipts(inbounds);

    const matSync = this.syncMaterialsFromReceipts({ emitMutation: true });

    if (isCodeChanged) {
      emitLocalMutation('meta');
    }
    notifySubscribers();
    emitLocalMutation('inbound', [newCodeKey]);
    return { success: true, newMaterialsCount: matSync.added + matSync.updated };
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
      tombstones.inbound[target.receiptCode] = now;
      tombstones.inbound[normKey(target.receiptCode)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = inbounds.filter((i) => i.id !== id && i.receiptCode !== id);
    this.saveInboundReceipts(filtered);
    this.syncMaterialsFromReceipts({ emitMutation: true });
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  deleteInboundReceipts(ids: string[]): number {
    if (!ids || ids.length === 0) return 0;
    const idSet = new Set(ids);
    const inbounds = this.getInboundReceipts();
    const now = Date.now();
    const tombstones = this.getTombstones();
    const filtered: InboundReceipt[] = [];

    for (let i = 0; i < inbounds.length; i++) {
      const r = inbounds[i];
      if (idSet.has(r.id) || idSet.has(r.receiptCode)) {
        tombstones.inbound[r.id] = now;
        tombstones.inbound[r.receiptCode] = now;
        tombstones.inbound[normKey(r.receiptCode)] = now;
      } else {
        filtered.push(r);
      }
    }

    const deletedCount = inbounds.length - filtered.length;
    if (deletedCount > 0) {
      this.saveTombstones(tombstones);
      this.saveInboundReceipts(filtered);
      this.syncMaterialsFromReceipts({ emitMutation: true });
      notifySubscribers();
      emitLocalMutation('meta');
    }
    return deletedCount;
  },

  // OUTBOUND RECEIPTS
  getOutboundReceipts(): OutboundReceipt[] {
    this.ensureInitialized();
    const outbounds = getItem<OutboundReceipt[]>(STORAGE_KEYS.OUTBOUND, []);
    let repaired = false;
    const normalized = outbounds.map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const sums = sumOutboundItems(items);
      if (o.totalQuantity !== sums.totalQuantity || o.totalWeightKg !== sums.totalWeightKg) {
        repaired = true;
        return {
          ...o,
          items,
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg
        };
      }
      return o;
    });
    if (repaired) {
      this.saveOutboundReceipts(normalized);
    }
    const tombstones = this.getTombstones();
    if (Object.keys(tombstones.outbound).length === 0) return normalized;
    return normalized.filter(
      (o) => !isRecordDeleted(tombstones.outbound, [o.id, normKey(o.issueCode), o.issueCode], o.updatedAt)
    );
  },

  saveOutboundReceipts(outbounds: OutboundReceipt[]): void {
    setItem(STORAGE_KEYS.OUTBOUND, outbounds);
  },

  addOutboundReceipt(rcp: OutboundReceipt): void {
    this.addOutboundReceipts([rcp]);
  },

  addOutboundReceipts(rcps: OutboundReceipt[]): { addedCount: number; newMaterialsCount?: number } {
    if (rcps.length === 0) return { addedCount: 0, newMaterialsCount: 0 };

    const now = Date.now();
    const stampedRcps = rcps.map((r) => ({ ...r, updatedAt: now }));
    const tombstones = this.getTombstones();
    const existingOutbounds = this.getOutboundReceipts();
    const mergedOut = mergeOutboundReceiptsAdditive(existingOutbounds, stampedRcps, tombstones.outbound);
    this.saveOutboundReceipts(mergedOut.list);

    const matSync = this.syncMaterialsFromReceipts({ emitMutation: true });

    notifySubscribers();
    emitLocalMutation('outbound', mergedOut.touchedCodes);
    return { addedCount: stampedRcps.length, newMaterialsCount: matSync.added + matSync.updated };
  },

  updateOutboundReceipt(
    originalId: string,
    updated: OutboundReceipt
  ): { success: boolean; newMaterialsCount?: number } {
    const outbounds = [...this.getOutboundReceipts()];
    const idx = outbounds.findIndex((o) => o.id === originalId || normKey(o.issueCode) === normKey(originalId));
    if (idx === -1) {
      return { success: false, newMaterialsCount: 0 };
    }

    const oldRcp = outbounds[idx];
    const now = Date.now();
    const oldCodeKey = normKey(oldRcp.issueCode || oldRcp.id);
    const newCodeKey = normKey(updated.issueCode || updated.id);
    const isCodeChanged = Boolean(oldCodeKey && newCodeKey && oldCodeKey !== newCodeKey);

    if (isCodeChanged) {
      const tombstones = this.getTombstones();
      const delTs = now - 1;
      tombstones.outbound[oldRcp.id] = delTs;
      tombstones.outbound[oldRcp.issueCode] = delTs;
      tombstones.outbound[oldCodeKey] = delTs;
      this.saveTombstones(tombstones);
    }

    const items = Array.isArray(updated.items) ? updated.items : [];
    const sums = sumOutboundItems(items);
    const salt = Math.random().toString(36).slice(2, 6);

    const savedReceipt: OutboundReceipt = {
      ...oldRcp,
      ...updated,
      id: isCodeChanged ? `out-rcp-${now}-${salt}` : oldRcp.id,
      items,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      updatedAt: now,
      itemsReplacedAt: now
    };

    outbounds[idx] = savedReceipt;
    this.saveOutboundReceipts(outbounds);

    const matSync = this.syncMaterialsFromReceipts({ emitMutation: true });

    if (isCodeChanged) {
      emitLocalMutation('meta');
    }
    notifySubscribers();
    emitLocalMutation('outbound', [newCodeKey]);
    return { success: true, newMaterialsCount: matSync.added + matSync.updated };
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
      tombstones.outbound[target.issueCode] = now;
      tombstones.outbound[normKey(target.issueCode)] = now;
    }
    this.saveTombstones(tombstones);

    const filtered = outbounds.filter((o) => o.id !== id && o.issueCode !== id);
    this.saveOutboundReceipts(filtered);
    this.syncMaterialsFromReceipts({ emitMutation: true });
    notifySubscribers();
    emitLocalMutation('meta');
    return true;
  },

  deleteOutboundReceipts(ids: string[]): number {
    if (!ids || ids.length === 0) return 0;
    const idSet = new Set(ids);
    const outbounds = this.getOutboundReceipts();
    const now = Date.now();
    const tombstones = this.getTombstones();
    const filtered: OutboundReceipt[] = [];

    for (let i = 0; i < outbounds.length; i++) {
      const o = outbounds[i];
      if (idSet.has(o.id) || idSet.has(o.issueCode)) {
        tombstones.outbound[o.id] = now;
        tombstones.outbound[o.issueCode] = now;
        tombstones.outbound[normKey(o.issueCode)] = now;
      } else {
        filtered.push(o);
      }
    }

    const deletedCount = outbounds.length - filtered.length;
    if (deletedCount > 0) {
      this.saveTombstones(tombstones);
      this.saveOutboundReceipts(filtered);
      this.syncMaterialsFromReceipts({ emitMutation: true });
      notifySubscribers();
      emitLocalMutation('meta');
    }
    return deletedCount;
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

      const matSync = this.syncMaterialsFromReceipts();
      if (matSync.changed) {
        anyChanged = true;
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

    const matSync = this.syncMaterialsFromReceipts();
    if (matSync.changed) {
      changed = true;
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
    }
    const matSync = this.syncMaterialsFromReceipts();
    if (merged.changed || matSync.changed) {
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
    }
    const matSync = this.syncMaterialsFromReceipts();
    if (merged.changed || matSync.changed) {
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

  // TÍNH TOÁN TỒN KHO THEO TỪNG KHO BÃI (Dùng cho Chọn tồn kho Xuất kho & Tổng quan)
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

    return applyStockAttributeFilters(baseRecords, filter, false);
  },

  // BÁO CÁO NHẬP - XUẤT - TỒN VẬT TƯ THIẾT BỊ:
  // Gộp các vật tư trùng thông tin (Số Packing List, Shipment, Package/Kiện hàng, Mã vật tư, Tên vật tư)
  // và tính tổng Nhập - Xuất - Tồn sau khi gộp (tối ưu O(N) + cache cho 100.000+ dòng).
  calculateMergedInventoryReport(filter?: StockFilterParams): InventoryStockRecord[] {
    const hasDateFilter = Boolean(filter?.startDate || filter?.endDate);
    const whId = filter?.warehouseId && filter.warehouseId !== 'all' ? filter.warehouseId : '';

    let mergedRecords: InventoryStockRecord[];

    if (!hasDateFilter && !whId) {
      const baseRecords = this.ensureBaseInventoryCache();
      if (cachedMergedReportVersion !== inventoryVersion) {
        cachedMergedReportRecords = mergeRecordsForInventoryReport(baseRecords);
        cachedMergedReportVersion = inventoryVersion;
      }
      mergedRecords = cachedMergedReportRecords;
    } else {
      let scopedRecords: InventoryStockRecord[];
      if (hasDateFilter) {
        const inbounds = this.getInboundReceipts();
        const outbounds = this.getOutboundReceipts();
        const warehouses = this.getWarehouses();
        const whMap = new Map<string, string>();
        for (let i = 0; i < warehouses.length; i++) {
          whMap.set(warehouses[i].id, warehouses[i].name);
        }
        scopedRecords = buildAggregatedRecords(
          inbounds,
          outbounds,
          whMap,
          filter?.startDate,
          filter?.endDate
        );
      } else {
        scopedRecords = this.ensureBaseInventoryCache();
      }

      if (whId) {
        const whFiltered: InventoryStockRecord[] = [];
        for (let i = 0; i < scopedRecords.length; i++) {
          if (scopedRecords[i].warehouseId === whId) {
            whFiltered.push(scopedRecords[i]);
          }
        }
        scopedRecords = whFiltered;
      }

      mergedRecords = mergeRecordsForInventoryReport(scopedRecords);
    }

    return applyStockAttributeFilters(mergedRecords, filter, true);
  },

  // ==========================================================================
  // QUẢN LÝ VẬT TƯ OSD (Overage - Shortage - Damage)
  // ==========================================================================
  getOsdReceipts(): OsdReceipt[] {
    this.ensureInitialized();
    const list = getItem<OsdReceipt[]>(STORAGE_KEYS.OSD, []);
    const tombstones = this.getTombstones();
    if (!tombstones.osd || Object.keys(tombstones.osd).length === 0) return list;
    return list.filter(
      (r) => !isRecordDeleted(tombstones.osd!, [r.id, normKey(r.osdCode), r.osdCode], r.updatedAt)
    );
  },

  saveOsdReceipts(receipts: OsdReceipt[]): void {
    setItem(STORAGE_KEYS.OSD, receipts);
    notifySubscribers();
  },

  addOsdReceipt(rcp: OsdReceipt): void {
    const list = this.getOsdReceipts();
    const now = Date.now();
    const stamped: OsdReceipt = { ...rcp, updatedAt: now };
    const next = [stamped, ...list];
    this.saveOsdReceipts(next);
    emitLocalMutation('osd', [rcp.osdCode]);
  },

  updateOsdReceipt(id: string, updated: OsdReceipt): boolean {
    const list = [...this.getOsdReceipts()];
    const idx = list.findIndex((r) => r.id === id || normKey(r.osdCode) === normKey(id));
    if (idx === -1) return false;
    const now = Date.now();
    list[idx] = { ...updated, updatedAt: now };
    this.saveOsdReceipts(list);
    emitLocalMutation('osd', [updated.osdCode]);
    return true;
  },

  deleteOsdReceipt(id: string): boolean {
    const list = this.getOsdReceipts();
    const target = list.find((r) => r.id === id || normKey(r.osdCode) === normKey(id));
    const next = list.filter((r) => r.id !== id && normKey(r.osdCode) !== normKey(id));
    if (next.length === list.length && !target) return false;
    const now = Date.now();
    const tombstones = this.getTombstones();
    if (!tombstones.osd) tombstones.osd = {};
    tombstones.osd[id] = now;
    tombstones.osd[normKey(id)] = now;
    if (target) {
      tombstones.osd[target.id] = now;
      tombstones.osd[target.osdCode] = now;
      tombstones.osd[normKey(target.osdCode)] = now;
    }
    this.saveTombstones(tombstones);
    this.saveOsdReceipts(next);
    emitLocalMutation('osd', target ? [target.osdCode] : undefined);
    return true;
  },

  toggleOsdStatus(
    id: string,
    status: OsdStatus,
    resolutionNotes?: string,
    resolvedBy?: string
  ): boolean {
    const list = [...this.getOsdReceipts()];
    const idx = list.findIndex((r) => r.id === id || normKey(r.osdCode) === normKey(id));
    if (idx === -1) return false;
    const curr = list[idx];
    const nowIso = new Date().toISOString();
    list[idx] = {
      ...curr,
      status,
      resolutionNotes: resolutionNotes !== undefined ? resolutionNotes : curr.resolutionNotes,
      resolvedAt: status === 'closed' ? (curr.resolvedAt || nowIso) : undefined,
      resolvedBy: status === 'closed' ? (resolvedBy || curr.resolvedBy || 'Quản lý kho') : undefined,
      updatedAt: Date.now()
    };
    this.saveOsdReceipts(list);
    emitLocalMutation('osd', [curr.osdCode]);
    return true;
  },

  applyRemoteOsdReceipts(receipts: OsdReceipt[]): boolean {
    if (!Array.isArray(receipts)) return false;
    const tombstones = this.getTombstones();
    const merged = mergeOsdReceiptsAdditive(this.getOsdReceipts(), receipts, tombstones.osd);
    if (merged.changed) {
      this.saveOsdReceipts(merged.list);
      return true;
    }
    return false;
  },

  cacheOsdPdfAttachment(id: string, dataUrl: string): boolean {
    if (!id || !dataUrl) return false;
    const list = [...this.getOsdReceipts()];
    const idx = list.findIndex((r) => r.id === id || normKey(r.osdCode) === normKey(id));
    if (idx === -1) return false;
    const curr = list[idx];
    if (!curr.pdfAttachment) return false;
    if (curr.pdfAttachment.dataUrl === dataUrl) return false;
    list[idx] = {
      ...curr,
      pdfAttachment: {
        ...curr.pdfAttachment,
        dataUrl
      }
    };
    this.saveOsdReceipts(list);
    return true;
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
