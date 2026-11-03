import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  InboundItemDetail,
  OutboundReceipt,
  OutboundItemDetail,
  TombstoneMap
} from '../types/inventory.ts';

export function createEmptyTombstones(): TombstoneMap {
  return {
    inbound: {},
    outbound: {},
    materials: {},
    warehouses: {},
    users: {}
  };
}

export function normKey(raw: string | undefined | null): string {
  return (raw || '').trim().toUpperCase();
}

export function normUserKey(raw: string | undefined | null): string {
  return (raw || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// ============================================================================
// Fast, Order-Independent 64-bit Deterministic Digests (O(N), WeakMap-cached)
// ============================================================================
function hashPair(str: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + ((i & 0xff) << 8);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return [h1 >>> 0, h2 >>> 0];
}

export function computeMetaDigest(
  users: User[],
  warehouses: Warehouse[],
  tombstones: TombstoneMap
): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  let tombCount = 0;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const [h1, h2] = hashPair(
      `U|${normUserKey(u.username)}|${u.id}|${u.fullName}|${u.role}|${u.password || ''}|${u.isActive ? 1 : 0}|${u.phone || ''}|${u.email || ''}|${u.department || ''}|${Number(u.updatedAt) || 0}|${Number(u.sessionRevokedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h1) >>> 0;
  }

  for (let i = 0; i < warehouses.length; i++) {
    const w = warehouses[i];
    const [h1, h2] = hashPair(
      `W|${normKey(w.code)}|${w.id}|${w.name}|${w.location || ''}|${w.type}|${w.capacityAreaM2 || 0}|${w.capacityTons || 0}|${w.keeperName || ''}|${w.phone || ''}|${w.status}|${w.notes || ''}|${Number(w.updatedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h2) >>> 0;
  }

  const buckets: Array<keyof TombstoneMap> = ['inbound', 'outbound', 'materials', 'warehouses', 'users'];
  for (let b = 0; b < buckets.length; b++) {
    const bucketName = buckets[b];
    const map = tombstones[bucketName] || {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const ts = Number(map[k]) || 0;
      if (ts <= 0) continue;
      tombCount++;
      const [h1, h2] = hashPair(`T|${bucketName}|${k}|${ts}`);
      sum1 = (sum1 + h1) >>> 0;
      sum2 = (sum2 + h2) >>> 0;
      xor1 = (xor1 ^ (h1 ^ h2)) >>> 0;
    }
  }

  return `${users.length}.${warehouses.length}.${tombCount}:${sum1.toString(36)}:${sum2.toString(36)}:${xor1.toString(36)}`;
}

export function computeMaterialsDigest(materials: MaterialItem[]): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const [h1, h2] = hashPair(
      `${normKey(m.code)}|${m.name || ''}|${m.unit || ''}|${m.category || ''}|${m.packageNo || ''}|${m.drawingNo || ''}|${m.manufacturer || ''}|${m.supplier || ''}|${Number(m.unitWeightKg) || 0}|${m.specification || ''}|${Number(m.minStockAlert) || 0}|${m.notes || ''}|${Number(m.updatedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h1) >>> 0;
  }

  return `${materials.length}:${sum1.toString(36)}:${sum2.toString(36)}:${xor1.toString(36)}`;
}

const inboundDigestCache = new WeakMap<InboundReceipt, { len: number; updatedAt: number; digest: string }>();
const outboundDigestCache = new WeakMap<OutboundReceipt, { len: number; updatedAt: number; digest: string }>();

export function computeInboundReceiptDigest(rcp: InboundReceipt): string {
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const up = Number(rcp.updatedAt) || 0;
  const rep = Number(rcp.itemsReplacedAt) || 0;
  const cached = inboundDigestCache.get(rcp);
  if (cached && cached.len === items.length && cached.updatedAt === up + rep) {
    return cached.digest;
  }

  const [hh1, hh2] = hashPair(
    `IH|${normKey(rcp.receiptCode || rcp.id)}|${rcp.receiptDate || ''}|${rcp.warehouseId || ''}|${rcp.warehouseName || ''}|${rcp.departmentName || ''}|${rcp.contractNo || ''}|${rcp.requestNo || ''}|${rcp.inboundType || ''}|${rcp.amountInWords || ''}|${rcp.attachedDocs || ''}|${rcp.supplier || ''}|${rcp.manufacturer || ''}|${rcp.shipment || ''}|${rcp.packingListNo || ''}|${rcp.delivererName || ''}|${rcp.receiverName || ''}|${rcp.driverVehicleNo || ''}|${rcp.notes || ''}|${Number(rcp.totalQuantity) || 0}|${Number(rcp.totalWeightKg) || 0}|${Number(rcp.totalAmount) || 0}|${rep}`
  );

  let sum1 = hh1;
  let sum2 = hh2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const [h1, h2] = hashPair(
      `${it.id || ''}|${it.materialCode || ''}|${it.materialName || ''}|${it.unit || ''}|${it.batchCode || ''}|${it.packingListNo || ''}|${it.shipment || ''}|${it.packageNo || ''}|${it.drawingNo || ''}|${it.category || ''}|${it.manufacturer || ''}|${it.supplier || ''}|${it.storageLocation || ''}|${Number(it.quantity) || 0}|${Number(it.weightKg) || 0}|${Number(it.unitPrice) || 0}|${Number(it.totalPrice) || 0}|${it.conditionNote || ''}|${it.note || ''}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
  }

  const digest = `${items.length}:${sum1.toString(36)}:${sum2.toString(36)}`;
  inboundDigestCache.set(rcp, { len: items.length, updatedAt: up + rep, digest });
  return digest;
}

export function computeOutboundReceiptDigest(rcp: OutboundReceipt): string {
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const up = Number(rcp.updatedAt) || 0;
  const rep = Number(rcp.itemsReplacedAt) || 0;
  const cached = outboundDigestCache.get(rcp);
  if (cached && cached.len === items.length && cached.updatedAt === up + rep) {
    return cached.digest;
  }

  const [hh1, hh2] = hashPair(
    `OH|${normKey(rcp.issueCode || rcp.id)}|${rcp.issueDate || ''}|${rcp.warehouseId || ''}|${rcp.warehouseName || ''}|${rcp.departmentName || ''}|${rcp.requestNo || ''}|${rcp.outboundType || ''}|${rcp.projectName || ''}|${rcp.recipientDepartment || ''}|${rcp.recipientName || ''}|${rcp.issuerName || ''}|${rcp.notes || ''}|${Number(rcp.totalQuantity) || 0}|${Number(rcp.totalWeightKg) || 0}|${rep}`
  );

  let sum1 = hh1;
  let sum2 = hh2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const [h1, h2] = hashPair(
      `${it.id || ''}|${it.materialCode || ''}|${it.materialName || ''}|${it.unit || ''}|${it.batchCode || ''}|${it.packingListNo || ''}|${it.shipment || ''}|${it.packageNo || ''}|${it.drawingNo || ''}|${it.category || ''}|${it.manufacturer || ''}|${it.supplier || ''}|${Number(it.quantity) || 0}|${Number(it.weightKg) || 0}|${it.purpose || ''}|${it.note || ''}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
  }

  const digest = `${items.length}:${sum1.toString(36)}:${sum2.toString(36)}`;
  outboundDigestCache.set(rcp, { len: items.length, updatedAt: up + rep, digest });
  return digest;
}

export function mergeTombstones(target: TombstoneMap, incoming?: Partial<TombstoneMap> | null): boolean {
  if (!incoming) return false;
  let changed = false;
  const buckets: Array<keyof TombstoneMap> = ['inbound', 'outbound', 'materials', 'warehouses', 'users'];

  for (let b = 0; b < buckets.length; b++) {
    const bucketName = buckets[b];
    const incBucket = incoming[bucketName];
    if (!incBucket) continue;
    const dstBucket = target[bucketName];
    const keys = Object.keys(incBucket);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const ts = Number(incBucket[k]) || 0;
      if (ts > 0 && (!dstBucket[k] || ts > dstBucket[k])) {
        dstBucket[k] = ts;
        changed = true;
      }
    }
  }
  return changed;
}

export function isRecordDeleted(
  bucket: Record<string, number> | undefined,
  keysToCheck: string[],
  recordUpdatedAt?: number
): boolean {
  if (!bucket) return false;
  const recTs = Number(recordUpdatedAt) || 0;
  for (let i = 0; i < keysToCheck.length; i++) {
    const k = keysToCheck[i];
    if (!k) continue;
    const delTs = bucket[k];
    if (delTs !== undefined && delTs >= recTs) {
      return true;
    }
  }
  return false;
}

export function computePackingListSummary(items: OutboundItemDetail[]): string {
  const seen = new Set<string>();
  const sample: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const pl = items[i].packingListNo;
    if (pl && !seen.has(pl)) {
      seen.add(pl);
      if (sample.length < 4) sample.push(pl);
    }
  }
  if (seen.size === 0) return 'N/A';
  if (seen.size <= sample.length) return sample.join(', ');
  return `${sample.join(', ')} (+${(seen.size - sample.length).toLocaleString('vi-VN')} PL)`;
}

// 1. USERS: Đồng bộ cộng gộp theo username (không ghi đè mất tài khoản của người khác)
export function mergeUsersAdditive(
  existing: User[],
  incoming: User[],
  tombstones: Record<string, number>
): { list: User[]; changed: boolean } {
  let changed = false;
  const result: User[] = [];
  const indexByUsername = new Map<string, number>();
  const indexById = new Map<string, number>();

  for (let i = 0; i < existing.length; i++) {
    const u = existing[i];
    const uKey = normUserKey(u.username);
    const isProtectedAdmin = uKey === 'võ dương phú' || uKey === 'vo duong phu' || u.id === 'user-admin-01';
    if (!isProtectedAdmin && isRecordDeleted(tombstones, [u.id, uKey], u.updatedAt)) {
      changed = true;
      continue;
    }
    const idx = result.length;
    result.push(u);
    if (uKey) indexByUsername.set(uKey, idx);
    if (u.id) indexById.set(u.id, idx);
  }

  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i];
    if (!inc || !inc.username) continue;
    const uKey = normUserKey(inc.username);
    const isProtectedAdmin = uKey === 'võ dương phú' || uKey === 'vo duong phu' || inc.id === 'user-admin-01';
    if (!isProtectedAdmin && isRecordDeleted(tombstones, [inc.id, uKey], inc.updatedAt)) {
      continue;
    }

    let existIdx = indexByUsername.get(uKey);
    if (existIdx === undefined && inc.id) {
      existIdx = indexById.get(inc.id);
    }

    if (existIdx === undefined) {
      const idx = result.length;
      result.push(inc);
      if (uKey) indexByUsername.set(uKey, idx);
      if (inc.id) indexById.set(inc.id, idx);
      changed = true;
    } else {
      const curr = result[existIdx];
      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const maxRevokedAt =
        Math.max(Number(curr.sessionRevokedAt) || 0, Number(inc.sessionRevokedAt) || 0) ||
        undefined;
      if (incTs > currTs) {
        const nextUser: User = {
          ...curr,
          ...inc,
          password: inc.password || curr.password,
          sessionRevokedAt: maxRevokedAt,
          updatedAt: incTs
        };
        if (
          nextUser.fullName !== curr.fullName ||
          nextUser.role !== curr.role ||
          nextUser.password !== curr.password ||
          nextUser.isActive !== curr.isActive ||
          nextUser.phone !== curr.phone ||
          nextUser.email !== curr.email ||
          nextUser.department !== curr.department ||
          nextUser.sessionRevokedAt !== curr.sessionRevokedAt ||
          nextUser.updatedAt !== curr.updatedAt
        ) {
          result[existIdx] = nextUser;
          changed = true;
        }
      } else {
        // Chỉ bổ sung thông tin còn thiếu và mốc thu hồi phiên lớn hơn, không ghi đè lùi
        const mergedFullName = curr.fullName || inc.fullName;
        const mergedEmail = curr.email || inc.email;
        const mergedPhone = curr.phone || inc.phone;
        const mergedDept = curr.department || inc.department;
        const mergedPass = curr.password || inc.password;
        if (
          mergedFullName !== curr.fullName ||
          mergedEmail !== curr.email ||
          mergedPhone !== curr.phone ||
          mergedDept !== curr.department ||
          mergedPass !== curr.password ||
          maxRevokedAt !== curr.sessionRevokedAt
        ) {
          result[existIdx] = {
            ...curr,
            fullName: mergedFullName,
            email: mergedEmail,
            phone: mergedPhone,
            department: mergedDept,
            password: mergedPass,
            sessionRevokedAt: maxRevokedAt
          };
          changed = true;
        }
      }
    }
  }

  return { list: result, changed };
}

// 2. WAREHOUSES: Đồng bộ cộng gộp theo mã kho (code)
export function mergeWarehousesAdditive(
  existing: Warehouse[],
  incoming: Warehouse[],
  tombstones: Record<string, number>
): { list: Warehouse[]; changed: boolean } {
  let changed = false;
  const result: Warehouse[] = [];
  const indexByCode = new Map<string, number>();
  const indexById = new Map<string, number>();

  for (let i = 0; i < existing.length; i++) {
    const w = existing[i];
    const cKey = normKey(w.code);
    if (isRecordDeleted(tombstones, [w.id, cKey], w.updatedAt)) {
      changed = true;
      continue;
    }
    const idx = result.length;
    result.push(w);
    if (cKey) indexByCode.set(cKey, idx);
    if (w.id) indexById.set(w.id, idx);
  }

  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i];
    if (!inc || (!inc.code && !inc.name)) continue;
    const cKey = normKey(inc.code);
    if (isRecordDeleted(tombstones, [inc.id, cKey], inc.updatedAt)) {
      continue;
    }

    let existIdx = cKey ? indexByCode.get(cKey) : undefined;
    if (existIdx === undefined && inc.id) {
      existIdx = indexById.get(inc.id);
    }

    if (existIdx === undefined) {
      const idx = result.length;
      result.push(inc);
      if (cKey) indexByCode.set(cKey, idx);
      if (inc.id) indexById.set(inc.id, idx);
      changed = true;
    } else {
      const curr = result[existIdx];
      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      if (incTs > currTs) {
        result[existIdx] = { ...curr, ...inc, updatedAt: incTs };
        changed = true;
      } else {
        const mergedLocation = curr.location || inc.location;
        const mergedKeeper = curr.keeperName || inc.keeperName;
        const mergedPhone = curr.phone || inc.phone;
        const mergedNotes = curr.notes || inc.notes;
        if (
          mergedLocation !== curr.location ||
          mergedKeeper !== curr.keeperName ||
          mergedPhone !== curr.phone ||
          mergedNotes !== curr.notes
        ) {
          result[existIdx] = {
            ...curr,
            location: mergedLocation,
            keeperName: mergedKeeper,
            phone: mergedPhone,
            notes: mergedNotes
          };
          changed = true;
        }
      }
    }
  }

  return { list: result, changed };
}

// 3. MATERIALS: Đồng bộ cộng gộp O(N + M) theo mã vật tư (code)
export function mergeMaterialsAdditive(
  existing: MaterialItem[],
  incoming: MaterialItem[],
  tombstones: Record<string, number>
): { list: MaterialItem[]; changed: boolean } {
  let changed = false;
  const result: MaterialItem[] = [];
  const indexByCode = new Map<string, number>();

  for (let i = 0; i < existing.length; i++) {
    const m = existing[i];
    const cKey = normKey(m.code);
    if (isRecordDeleted(tombstones, [m.id, cKey], m.updatedAt)) {
      changed = true;
      continue;
    }
    const idx = result.length;
    result.push(m);
    if (cKey) indexByCode.set(cKey, idx);
  }

  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i];
    if (!inc) continue;
    const cKey = normKey(inc.code);
    if (!cKey) continue;
    if (isRecordDeleted(tombstones, [inc.id, cKey], inc.updatedAt)) {
      continue;
    }

    const existIdx = indexByCode.get(cKey);
    if (existIdx === undefined) {
      const idx = result.length;
      result.push(inc);
      indexByCode.set(cKey, idx);
      changed = true;
    } else {
      const curr = result[existIdx];
      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      if (incTs > currTs) {
        result[existIdx] = {
          ...curr,
          name: inc.name || curr.name,
          unit: inc.unit || curr.unit,
          category: inc.category || curr.category,
          packageNo: inc.packageNo !== undefined && inc.packageNo !== '' ? inc.packageNo : curr.packageNo,
          drawingNo: inc.drawingNo !== undefined && inc.drawingNo !== '' ? inc.drawingNo : curr.drawingNo,
          manufacturer: inc.manufacturer !== undefined && inc.manufacturer !== '' ? inc.manufacturer : curr.manufacturer,
          supplier: inc.supplier !== undefined && inc.supplier !== '' ? inc.supplier : curr.supplier,
          unitWeightKg: inc.unitWeightKg || curr.unitWeightKg,
          specification: inc.specification !== undefined && inc.specification !== '' ? inc.specification : curr.specification,
          minStockAlert: inc.minStockAlert ?? curr.minStockAlert,
          notes: inc.notes !== undefined && inc.notes !== '' ? inc.notes : curr.notes,
          updatedAt: incTs
        };
        changed = true;
      } else {
        // Chỉ điền bổ sung các trường đang trống, tuyệt đối không ghi đè dữ liệu đã có
        const needEnrich =
          (!curr.packageNo && Boolean(inc.packageNo)) ||
          (!curr.drawingNo && Boolean(inc.drawingNo)) ||
          (!curr.manufacturer && Boolean(inc.manufacturer)) ||
          (!curr.supplier && Boolean(inc.supplier)) ||
          (!curr.unitWeightKg && Boolean(inc.unitWeightKg)) ||
          (!curr.specification && Boolean(inc.specification)) ||
          (!curr.notes && Boolean(inc.notes));

        if (needEnrich) {
          result[existIdx] = {
            ...curr,
            packageNo: curr.packageNo || inc.packageNo,
            drawingNo: curr.drawingNo || inc.drawingNo,
            manufacturer: curr.manufacturer || inc.manufacturer,
            supplier: curr.supplier || inc.supplier,
            unitWeightKg: curr.unitWeightKg || inc.unitWeightKg,
            specification: curr.specification || inc.specification,
            notes: curr.notes || inc.notes
          };
          changed = true;
        }
      }
    }
  }

  return { list: result, changed };
}

export function roundQty(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

export function buildDeterministicItemId(
  prefix: 'in' | 'out',
  receiptCode: string,
  signatureSeed: string,
  occurrence: number
): string {
  const [h1, h2] = hashPair(`${normKey(receiptCode)}|${signatureSeed}`);
  return `${prefix}-det-${h1.toString(36)}${h2.toString(36)}-${occurrence}`;
}

export function sumInboundItems(items: InboundItemDetail[]): {
  totalQuantity: number;
  totalWeightKg: number;
  totalAmount: number;
  packageCount: number;
} {
  let totalQty = 0;
  let totalWeight = 0;
  let totalAmt = 0;
  let pkgCount = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const q = roundQty(it.quantity);
    const w = Number(it.weightKg) || 0;
    const uPrice = Number(it.unitPrice) || 0;
    const lineAmt = Number(it.totalPrice) > 0 ? Number(it.totalPrice) : q * uPrice;
    totalQty += q;
    totalWeight += w;
    totalAmt += lineAmt;
    if (it.batchCode || it.packageNo) pkgCount++;
  }
  return {
    totalQuantity: roundQty(totalQty),
    totalWeightKg: Math.round(totalWeight * 100) / 100,
    totalAmount: Math.round(totalAmt * 100) / 100,
    packageCount: pkgCount
  };
}

export function sumOutboundItems(items: OutboundItemDetail[]): {
  totalQuantity: number;
  totalWeightKg: number;
} {
  let totalQty = 0;
  let totalWeight = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    totalQty += roundQty(it.quantity);
    totalWeight += Number(it.weightKg) || 0;
  }
  return {
    totalQuantity: roundQty(totalQty),
    totalWeightKg: Math.round(totalWeight * 100) / 100
  };
}

function makeInboundItemSig(it: InboundItemDetail): string {
  if (it.id) return it.id;
  return `${it.materialCode}__${it.batchCode || ''}__${it.packingListNo}__${it.packageNo}__${it.drawingNo}__${roundQty(it.quantity)}__${Number(it.weightKg) || 0}`;
}

function makeOutboundItemSig(it: OutboundItemDetail): string {
  if (it.id) return it.id;
  return `${it.materialCode}__${it.batchCode || ''}__${it.packingListNo}__${it.packageNo}__${it.drawingNo}__${roundQty(it.quantity)}__${Number(it.weightKg) || 0}`;
}

// 4. INBOUND RECEIPTS: Đồng bộ cộng gộp O(N) theo receiptCode + cộng gộp dòng vật tư con (không bao giờ ghi đè mất phiếu/dòng)
export function mergeInboundReceiptsAdditive(
  existing: InboundReceipt[],
  incoming: InboundReceipt[],
  tombstones: Record<string, number>
): { list: InboundReceipt[]; changed: boolean; touchedCodes: string[] } {
  let changed = false;
  const touchedSet = new Set<string>();
  const existingFiltered: InboundReceipt[] = [];

  for (let i = 0; i < existing.length; i++) {
    const r = existing[i];
    const rKey = normKey(r.receiptCode || r.id);
    if (isRecordDeleted(tombstones, [r.id, rKey, r.receiptCode], r.updatedAt)) {
      changed = true;
      continue;
    }
    const items = Array.isArray(r.items) ? r.items : [];
    const sums = sumInboundItems(items);
    if (
      r.totalQuantity !== sums.totalQuantity ||
      r.totalWeightKg !== sums.totalWeightKg ||
      (r.totalAmount ?? 0) !== sums.totalAmount
    ) {
      existingFiltered.push({
        ...r,
        items,
        packageCount: sums.packageCount,
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        totalAmount: sums.totalAmount
      });
      changed = true;
    } else {
      existingFiltered.push(r);
    }
  }

  const indexByCode = new Map<string, number>();
  for (let i = 0; i < existingFiltered.length; i++) {
    const r = existingFiltered[i];
    const rKey = normKey(r.receiptCode || r.id);
    if (rKey) indexByCode.set(rKey, i);
  }

  const newlyPrepended: InboundReceipt[] = [];
  const newPrependedIndex = new Map<string, number>();

  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i];
    if (!inc) continue;
    const rKey = normKey(inc.receiptCode || inc.id);
    if (!rKey) continue;
    if (isRecordDeleted(tombstones, [inc.id, rKey, inc.receiptCode], inc.updatedAt)) {
      continue;
    }

    const existIdx = indexByCode.get(rKey);
    const prepIdx = existIdx === undefined ? newPrependedIndex.get(rKey) : undefined;

    if (existIdx === undefined && prepIdx === undefined) {
      // Phiếu mới hoàn toàn -> thêm vào danh sách
      const items = Array.isArray(inc.items) ? inc.items : [];
      const sums = sumInboundItems(items);

      const cleanReceipt: InboundReceipt = {
        ...inc,
        items,
        packageCount: sums.packageCount,
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        totalAmount: sums.totalAmount,
        updatedAt: Number(inc.updatedAt) || 1,
        itemsReplacedAt: Number(inc.itemsReplacedAt) || undefined
      };

      const pIdx = newlyPrepended.length;
      newlyPrepended.push(cleanReceipt);
      newPrependedIndex.set(rKey, pIdx);
      touchedSet.add(rKey);
      changed = true;
    } else {
      const targetArr = existIdx !== undefined ? existingFiltered : newlyPrepended;
      const targetIdx = existIdx !== undefined ? existIdx : prepIdx!;
      const curr = targetArr[targetIdx];
      const incItems = Array.isArray(inc.items) ? inc.items : [];

      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const incRev = Number(inc.itemsReplacedAt) || 0;
      const currRev = Number(curr.itemsReplacedAt) || 0;

      // Trường hợp 1: Bản ghi đến từ thao tác Admin sửa phiếu mới hơn -> thay thế toàn bộ items & thông tin phiếu theo bản sửa mới nhất
      if (incRev > currRev) {
        const dedupedIncItems: InboundItemDetail[] = [];
        const seenSigs = new Set<string>();
        for (let j = 0; j < incItems.length; j++) {
          const sig = makeInboundItemSig(incItems[j]);
          if (!seenSigs.has(sig)) {
            seenSigs.add(sig);
            dedupedIncItems.push(incItems[j]);
          }
        }
        const sums = sumInboundItems(dedupedIncItems);
        targetArr[targetIdx] = {
          ...curr,
          ...inc,
          id: curr.id || inc.id,
          receiptCode: inc.receiptCode || curr.receiptCode,
          items: dedupedIncItems,
          packageCount: sums.packageCount,
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          totalAmount: sums.totalAmount,
          updatedAt: Math.max(currTs, incTs, incRev) || 1,
          itemsReplacedAt: incRev,
          lastEditedBy: inc.lastEditedBy ?? curr.lastEditedBy,
          lastEditedAt: inc.lastEditedAt ?? curr.lastEditedAt
        };
        touchedSet.add(rKey);
        changed = true;
        continue;
      }

      // Trường hợp 2: Bản ghi đến là bản cũ trước khi Admin sửa -> bỏ qua để không khôi phục dòng đã xóa/sửa
      if (incRev < currRev) {
        continue;
      }

      // Trường hợp 3 (incRev === currRev): Cộng gộp các dòng chưa có (hoặc các chunk của cùng 1 phiên sửa)
      const seenItemSigs = new Map<string, number>();
      const nextItems = curr.items.slice();
      let itemsMutated = false;

      for (let j = 0; j < nextItems.length; j++) {
        seenItemSigs.set(makeInboundItemSig(nextItems[j]), j);
      }

      const headerNewer = incTs > currTs;

      for (let j = 0; j < incItems.length; j++) {
        const incIt = incItems[j];
        const sig = makeInboundItemSig(incIt);
        const existingItemIdx = seenItemSigs.get(sig);
        if (existingItemIdx === undefined) {
          seenItemSigs.set(sig, nextItems.length);
          nextItems.push(incIt);
          itemsMutated = true;
        } else if (headerNewer) {
          const prevIt = nextItems[existingItemIdx];
          if (
            prevIt.quantity !== incIt.quantity ||
            prevIt.weightKg !== incIt.weightKg ||
            prevIt.materialCode !== incIt.materialCode ||
            prevIt.materialName !== incIt.materialName ||
            prevIt.unit !== incIt.unit ||
            prevIt.batchCode !== incIt.batchCode ||
            prevIt.unitPrice !== incIt.unitPrice ||
            prevIt.totalPrice !== incIt.totalPrice ||
            prevIt.note !== incIt.note
          ) {
            nextItems[existingItemIdx] = incIt;
            itemsMutated = true;
          }
        }
      }

      if (itemsMutated || headerNewer) {
        const mergedItems = itemsMutated ? nextItems : curr.items;
        const sums = sumInboundItems(mergedItems);

        targetArr[targetIdx] = {
          ...curr,
          receiptDate: headerNewer && inc.receiptDate ? inc.receiptDate : curr.receiptDate,
          warehouseId: headerNewer && inc.warehouseId ? inc.warehouseId : curr.warehouseId,
          warehouseName: headerNewer && inc.warehouseName ? inc.warehouseName : curr.warehouseName,
          departmentName:
            headerNewer && inc.departmentName !== undefined
              ? inc.departmentName
              : curr.departmentName || inc.departmentName,
          contractNo:
            headerNewer && inc.contractNo !== undefined ? inc.contractNo : curr.contractNo || inc.contractNo,
          requestNo:
            headerNewer && inc.requestNo !== undefined ? inc.requestNo : curr.requestNo || inc.requestNo,
          inboundType:
            headerNewer && inc.inboundType !== undefined
              ? inc.inboundType
              : curr.inboundType || inc.inboundType,
          amountInWords:
            headerNewer && inc.amountInWords !== undefined
              ? inc.amountInWords
              : curr.amountInWords || inc.amountInWords,
          attachedDocs:
            headerNewer && inc.attachedDocs !== undefined
              ? inc.attachedDocs
              : curr.attachedDocs || inc.attachedDocs,
          supplier: headerNewer && inc.supplier ? inc.supplier : curr.supplier || inc.supplier,
          manufacturer: headerNewer && inc.manufacturer ? inc.manufacturer : curr.manufacturer || inc.manufacturer,
          shipment: headerNewer && inc.shipment ? inc.shipment : curr.shipment || inc.shipment,
          packingListNo: headerNewer && inc.packingListNo ? inc.packingListNo : curr.packingListNo || inc.packingListNo,
          delivererName: headerNewer && inc.delivererName ? inc.delivererName : curr.delivererName || inc.delivererName,
          receiverName: headerNewer && inc.receiverName ? inc.receiverName : curr.receiverName || inc.receiverName,
          driverVehicleNo:
            headerNewer && inc.driverVehicleNo !== undefined
              ? inc.driverVehicleNo
              : curr.driverVehicleNo || inc.driverVehicleNo,
          notes: headerNewer && inc.notes !== undefined ? inc.notes : curr.notes || inc.notes,
          items: mergedItems,
          packageCount: sums.packageCount,
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          totalAmount: sums.totalAmount,
          updatedAt: Math.max(currTs, incTs) || 1,
          itemsReplacedAt: currRev || undefined,
          lastEditedBy: headerNewer && inc.lastEditedBy ? inc.lastEditedBy : curr.lastEditedBy,
          lastEditedAt: headerNewer && inc.lastEditedAt ? inc.lastEditedAt : curr.lastEditedAt
        };
        touchedSet.add(rKey);
        changed = true;
      }
    }
  }

  const finalList = newlyPrepended.length > 0 ? newlyPrepended.concat(existingFiltered) : existingFiltered;
  return { list: finalList, changed, touchedCodes: Array.from(touchedSet) };
}

// 5. OUTBOUND RECEIPTS: Đồng bộ cộng gộp O(N) theo issueCode + hỗ trợ Admin sửa phiếu chuẩn xác
export function mergeOutboundReceiptsAdditive(
  existing: OutboundReceipt[],
  incoming: OutboundReceipt[],
  tombstones: Record<string, number>
): { list: OutboundReceipt[]; changed: boolean; touchedCodes: string[] } {
  let changed = false;
  const touchedSet = new Set<string>();
  const existingFiltered: OutboundReceipt[] = [];

  for (let i = 0; i < existing.length; i++) {
    const r = existing[i];
    const rKey = normKey(r.issueCode || r.id);
    if (isRecordDeleted(tombstones, [r.id, rKey, r.issueCode], r.updatedAt)) {
      changed = true;
      continue;
    }
    const items = Array.isArray(r.items) ? r.items : [];
    const sums = sumOutboundItems(items);
    if (r.totalQuantity !== sums.totalQuantity || r.totalWeightKg !== sums.totalWeightKg) {
      existingFiltered.push({
        ...r,
        items,
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg
      });
      changed = true;
    } else {
      existingFiltered.push(r);
    }
  }

  const indexByCode = new Map<string, number>();
  for (let i = 0; i < existingFiltered.length; i++) {
    const r = existingFiltered[i];
    const rKey = normKey(r.issueCode || r.id);
    if (rKey) indexByCode.set(rKey, i);
  }

  const newlyPrepended: OutboundReceipt[] = [];
  const newPrependedIndex = new Map<string, number>();

  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i];
    if (!inc) continue;
    const rKey = normKey(inc.issueCode || inc.id);
    if (!rKey) continue;
    if (isRecordDeleted(tombstones, [inc.id, rKey, inc.issueCode], inc.updatedAt)) {
      continue;
    }

    const existIdx = indexByCode.get(rKey);
    const prepIdx = existIdx === undefined ? newPrependedIndex.get(rKey) : undefined;

    if (existIdx === undefined && prepIdx === undefined) {
      const items = Array.isArray(inc.items) ? inc.items : [];
      const sums = sumOutboundItems(items);

      const cleanReceipt: OutboundReceipt = {
        ...inc,
        items,
        packingListSummary: inc.packingListSummary || computePackingListSummary(items),
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        updatedAt: Number(inc.updatedAt) || 1,
        itemsReplacedAt: Number(inc.itemsReplacedAt) || undefined
      };

      const pIdx = newlyPrepended.length;
      newlyPrepended.push(cleanReceipt);
      newPrependedIndex.set(rKey, pIdx);
      touchedSet.add(rKey);
      changed = true;
    } else {
      const targetArr = existIdx !== undefined ? existingFiltered : newlyPrepended;
      const targetIdx = existIdx !== undefined ? existIdx : prepIdx!;
      const curr = targetArr[targetIdx];
      const incItems = Array.isArray(inc.items) ? inc.items : [];

      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const incRev = Number(inc.itemsReplacedAt) || 0;
      const currRev = Number(curr.itemsReplacedAt) || 0;

      // Trường hợp 1: Bản ghi đến từ thao tác Admin sửa phiếu xuất mới hơn -> thay thế toàn bộ items & header theo bản sửa mới nhất
      if (incRev > currRev) {
        const dedupedIncItems: OutboundItemDetail[] = [];
        const seenSigs = new Set<string>();
        for (let j = 0; j < incItems.length; j++) {
          const sig = makeOutboundItemSig(incItems[j]);
          if (!seenSigs.has(sig)) {
            seenSigs.add(sig);
            dedupedIncItems.push(incItems[j]);
          }
        }
        const sums = sumOutboundItems(dedupedIncItems);
        targetArr[targetIdx] = {
          ...curr,
          ...inc,
          id: curr.id || inc.id,
          issueCode: inc.issueCode || curr.issueCode,
          items: dedupedIncItems,
          packingListSummary: computePackingListSummary(dedupedIncItems),
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          updatedAt: Math.max(currTs, incTs, incRev) || 1,
          itemsReplacedAt: incRev,
          lastEditedBy: inc.lastEditedBy ?? curr.lastEditedBy,
          lastEditedAt: inc.lastEditedAt ?? curr.lastEditedAt
        };
        touchedSet.add(rKey);
        changed = true;
        continue;
      }

      // Trường hợp 2: Bản ghi đến là bản cũ trước khi Admin sửa -> bỏ qua
      if (incRev < currRev) {
        continue;
      }

      // Trường hợp 3 (incRev === currRev): Cộng gộp dòng mới hoặc chunk cùng phiên sửa
      const seenItemSigs = new Map<string, number>();
      const nextItems = curr.items.slice();
      let itemsMutated = false;

      for (let j = 0; j < nextItems.length; j++) {
        seenItemSigs.set(makeOutboundItemSig(nextItems[j]), j);
      }

      const headerNewer = incTs > currTs;

      for (let j = 0; j < incItems.length; j++) {
        const incIt = incItems[j];
        const sig = makeOutboundItemSig(incIt);
        const existingItemIdx = seenItemSigs.get(sig);
        if (existingItemIdx === undefined) {
          seenItemSigs.set(sig, nextItems.length);
          nextItems.push(incIt);
          itemsMutated = true;
        } else if (headerNewer) {
          const prevIt = nextItems[existingItemIdx];
          if (
            prevIt.quantity !== incIt.quantity ||
            prevIt.weightKg !== incIt.weightKg ||
            prevIt.materialCode !== incIt.materialCode ||
            prevIt.materialName !== incIt.materialName ||
            prevIt.unit !== incIt.unit ||
            prevIt.batchCode !== incIt.batchCode ||
            prevIt.purpose !== incIt.purpose ||
            prevIt.note !== incIt.note
          ) {
            nextItems[existingItemIdx] = incIt;
            itemsMutated = true;
          }
        }
      }

      if (itemsMutated || headerNewer) {
        const mergedItems = itemsMutated ? nextItems : curr.items;
        const sums = sumOutboundItems(mergedItems);

        targetArr[targetIdx] = {
          ...curr,
          issueDate: headerNewer && inc.issueDate ? inc.issueDate : curr.issueDate,
          warehouseId: headerNewer && inc.warehouseId ? inc.warehouseId : curr.warehouseId,
          warehouseName: headerNewer && inc.warehouseName ? inc.warehouseName : curr.warehouseName,
          departmentName:
            headerNewer && inc.departmentName !== undefined
              ? inc.departmentName
              : curr.departmentName || inc.departmentName,
          requestNo:
            headerNewer && inc.requestNo !== undefined ? inc.requestNo : curr.requestNo || inc.requestNo,
          outboundType:
            headerNewer && inc.outboundType !== undefined
              ? inc.outboundType
              : curr.outboundType || inc.outboundType,
          projectName: headerNewer && inc.projectName !== undefined ? inc.projectName : curr.projectName || inc.projectName,
          recipientDepartment:
            headerNewer && inc.recipientDepartment
              ? inc.recipientDepartment
              : curr.recipientDepartment || inc.recipientDepartment,
          recipientName:
            headerNewer && inc.recipientName ? inc.recipientName : curr.recipientName || inc.recipientName,
          issuerName: headerNewer && inc.issuerName ? inc.issuerName : curr.issuerName || inc.issuerName,
          notes: headerNewer && inc.notes !== undefined ? inc.notes : curr.notes || inc.notes,
          items: mergedItems,
          packingListSummary: computePackingListSummary(mergedItems),
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          updatedAt: Math.max(currTs, incTs) || 1,
          itemsReplacedAt: currRev || undefined,
          lastEditedBy: headerNewer && inc.lastEditedBy ? inc.lastEditedBy : curr.lastEditedBy,
          lastEditedAt: headerNewer && inc.lastEditedAt ? inc.lastEditedAt : curr.lastEditedAt
        };
        touchedSet.add(rKey);
        changed = true;
      }
    }
  }

  const finalList = newlyPrepended.length > 0 ? newlyPrepended.concat(existingFiltered) : existingFiltered;
  return { list: finalList, changed, touchedCodes: Array.from(touchedSet) };
}
