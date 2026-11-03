import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SESSION_HMAC_SECRET =
  process.env.SESSION_SECRET || 'vtp-inventory-single-device-hmac-secret-2026-v2';

const ACTIVE_SESSION_TTL_MS = 90_000;

const INITIAL_SEED_USERS = [
  {
    id: 'user-admin-01',
    username: 'Võ Dương Phú',
    fullName: 'Võ Dương Phú (Tổng Quản Trị)',
    role: 'admin',
    password: '1234567',
    email: 'voduongphu@gmail.com',
    phone: '0901156220',
    department: 'Ban QLVT',
    isActive: true,
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: 1
  },
  {
    id: 'user-1791865267798',
    username: 'Trương Minh Độ',
    fullName: 'Trương Minh Độ',
    role: 'manager',
    password: '123456',
    email: 'dotruong@kho-vattu.vn',
    phone: '0901156222',
    department: 'Tổ QLVT',
    isActive: true,
    createdAt: '2026-10-13T04:21:07.798Z',
    updatedAt: 1
  }
];

const INITIAL_SEED_WAREHOUSES = [
  {
    id: 'wh-1791865085079',
    code: 'LP1-T08-PMT',
    name: 'Kho Long Phú 1',
    location: 'Xã Đại Ngãi, thành phố Cần Thơ',
    type: 'covered',
    capacityAreaM2: 10000,
    capacityTons: 15000,
    keeperName: 'Võ Dương Phú',
    phone: '',
    status: 'active',
    notes: '',
    createdAt: '2026-10-13T04:18:05.079Z',
    updatedAt: 1
  }
];

function createEmptyTombstones() {
  return {
    inbound: {},
    outbound: {},
    materials: {},
    warehouses: {},
    users: {}
  };
}

function normKey(raw) {
  return String(raw || '').trim().toUpperCase();
}

function normUserKey(raw) {
  return String(raw || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function hashPair(str) {
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

function computeMetaDigest(users, warehouses, tombstones) {
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

  const buckets = ['inbound', 'outbound', 'materials', 'warehouses', 'users'];
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

function computeMaterialsDigest(materials) {
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

function computeInboundReceiptDigest(rcp) {
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const rep = Number(rcp.itemsReplacedAt) || 0;
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
  return `${items.length}:${sum1.toString(36)}:${sum2.toString(36)}`;
}

function computeOutboundReceiptDigest(rcp) {
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const rep = Number(rcp.itemsReplacedAt) || 0;
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
  return `${items.length}:${sum1.toString(36)}:${sum2.toString(36)}`;
}

function mergeTombstones(target, incoming) {
  if (!incoming) return false;
  let changed = false;
  const buckets = ['inbound', 'outbound', 'materials', 'warehouses', 'users'];
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

function isRecordDeleted(bucket, keysToCheck, recordUpdatedAt) {
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

function computePackingListSummary(items) {
  const seen = new Set();
  const sample = [];
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

function mergeUsersAdditive(existing, incoming, tombstones) {
  let changed = false;
  const result = [];
  const indexByUsername = new Map();
  const indexById = new Map();

  for (let i = 0; i < existing.length; i++) {
    const u = existing[i];
    const uKey = normUserKey(u.username);
    const isProtectedAdmin =
      uKey === 'võ dương phú' || uKey === 'vo duong phu' || u.id === 'user-admin-01';
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
    const isProtectedAdmin =
      uKey === 'võ dương phú' || uKey === 'vo duong phu' || inc.id === 'user-admin-01';
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
        const nextUser = {
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

function mergeWarehousesAdditive(existing, incoming, tombstones) {
  let changed = false;
  const result = [];
  const indexByCode = new Map();
  const indexById = new Map();

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

function mergeMaterialsAdditive(existing, incoming, tombstones) {
  let changed = false;
  const result = [];
  const indexByCode = new Map();

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
          manufacturer:
            inc.manufacturer !== undefined && inc.manufacturer !== ''
              ? inc.manufacturer
              : curr.manufacturer,
          supplier: inc.supplier !== undefined && inc.supplier !== '' ? inc.supplier : curr.supplier,
          unitWeightKg: inc.unitWeightKg || curr.unitWeightKg,
          specification:
            inc.specification !== undefined && inc.specification !== ''
              ? inc.specification
              : curr.specification,
          minStockAlert: inc.minStockAlert ?? curr.minStockAlert,
          notes: inc.notes !== undefined && inc.notes !== '' ? inc.notes : curr.notes,
          updatedAt: incTs
        };
        changed = true;
      } else {
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

function roundQty(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function sumInboundItems(items) {
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

function sumOutboundItems(items) {
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

function makeItemSig(it) {
  if (it.id) return it.id;
  return `${it.materialCode}__${it.batchCode || ''}__${it.packingListNo}__${it.packageNo}__${it.drawingNo}__${roundQty(it.quantity)}__${Number(it.weightKg) || 0}`;
}

function mergeInboundReceiptsAdditive(existing, incoming, tombstones) {
  let changed = false;
  const touchedSet = new Set();
  const existingFiltered = [];

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

  const indexByCode = new Map();
  for (let i = 0; i < existingFiltered.length; i++) {
    const r = existingFiltered[i];
    const rKey = normKey(r.receiptCode || r.id);
    if (rKey) indexByCode.set(rKey, i);
  }

  const newlyPrepended = [];
  const newPrependedIndex = new Map();

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
      const items = Array.isArray(inc.items) ? inc.items : [];
      const sums = sumInboundItems(items);

      const cleanReceipt = {
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
      const targetIdx = existIdx !== undefined ? existIdx : prepIdx;
      const curr = targetArr[targetIdx];
      const incItems = Array.isArray(inc.items) ? inc.items : [];

      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const incRev = Number(inc.itemsReplacedAt) || 0;
      const currRev = Number(curr.itemsReplacedAt) || 0;

      if (incRev > currRev) {
        const dedupedIncItems = [];
        const seenSigs = new Set();
        for (let j = 0; j < incItems.length; j++) {
          const sig = makeItemSig(incItems[j]);
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

      if (incRev < currRev) {
        continue;
      }

      const seenItemSigs = new Map();
      const nextItems = curr.items.slice();
      let itemsMutated = false;

      for (let j = 0; j < nextItems.length; j++) {
        seenItemSigs.set(makeItemSig(nextItems[j]), j);
      }

      const headerNewer = incTs > currTs;

      for (let j = 0; j < incItems.length; j++) {
        const incIt = incItems[j];
        const sig = makeItemSig(incIt);
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
            headerNewer && inc.contractNo !== undefined
              ? inc.contractNo
              : curr.contractNo || inc.contractNo,
          requestNo:
            headerNewer && inc.requestNo !== undefined
              ? inc.requestNo
              : curr.requestNo || inc.requestNo,
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
          manufacturer:
            headerNewer && inc.manufacturer ? inc.manufacturer : curr.manufacturer || inc.manufacturer,
          shipment: headerNewer && inc.shipment ? inc.shipment : curr.shipment || inc.shipment,
          packingListNo:
            headerNewer && inc.packingListNo
              ? inc.packingListNo
              : curr.packingListNo || inc.packingListNo,
          delivererName:
            headerNewer && inc.delivererName
              ? inc.delivererName
              : curr.delivererName || inc.delivererName,
          receiverName:
            headerNewer && inc.receiverName ? inc.receiverName : curr.receiverName || inc.receiverName,
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

  const finalList =
    newlyPrepended.length > 0 ? newlyPrepended.concat(existingFiltered) : existingFiltered;
  return { list: finalList, changed, touchedCodes: Array.from(touchedSet) };
}

function mergeOutboundReceiptsAdditive(existing, incoming, tombstones) {
  let changed = false;
  const touchedSet = new Set();
  const existingFiltered = [];

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

  const indexByCode = new Map();
  for (let i = 0; i < existingFiltered.length; i++) {
    const r = existingFiltered[i];
    const rKey = normKey(r.issueCode || r.id);
    if (rKey) indexByCode.set(rKey, i);
  }

  const newlyPrepended = [];
  const newPrependedIndex = new Map();

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

      const cleanReceipt = {
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
      const targetIdx = existIdx !== undefined ? existIdx : prepIdx;
      const curr = targetArr[targetIdx];
      const incItems = Array.isArray(inc.items) ? inc.items : [];

      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const incRev = Number(inc.itemsReplacedAt) || 0;
      const currRev = Number(curr.itemsReplacedAt) || 0;

      if (incRev > currRev) {
        const dedupedIncItems = [];
        const seenSigs = new Set();
        for (let j = 0; j < incItems.length; j++) {
          const sig = makeItemSig(incItems[j]);
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

      if (incRev < currRev) {
        continue;
      }

      const seenItemSigs = new Map();
      const nextItems = curr.items.slice();
      let itemsMutated = false;

      for (let j = 0; j < nextItems.length; j++) {
        seenItemSigs.set(makeItemSig(nextItems[j]), j);
      }

      const headerNewer = incTs > currTs;

      for (let j = 0; j < incItems.length; j++) {
        const incIt = incItems[j];
        const sig = makeItemSig(incIt);
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
            headerNewer && inc.requestNo !== undefined
              ? inc.requestNo
              : curr.requestNo || inc.requestNo,
          outboundType:
            headerNewer && inc.outboundType !== undefined
              ? inc.outboundType
              : curr.outboundType || inc.outboundType,
          projectName:
            headerNewer && inc.projectName !== undefined
              ? inc.projectName
              : curr.projectName || inc.projectName,
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

  const finalList =
    newlyPrepended.length > 0 ? newlyPrepended.concat(existingFiltered) : existingFiltered;
  return { list: finalList, changed, touchedCodes: Array.from(touchedSet) };
}

function getSessionIssuedAtMs(sess) {
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

function createSignedSessionToken(userKey, deviceId, issuedAtMs) {
  const nonce = crypto.randomUUID();
  const devB64 = Buffer.from(String(deviceId || ''), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(`${userKey}|${deviceId}|${nonce}|${issuedAtMs}`)
    .digest('hex')
    .slice(0, 24);
  return `${nonce}.${issuedAtMs}.${devB64}.${sig}`;
}

function verifySignedSessionToken(token, userKey, expectedDeviceId) {
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

function codeToFileName(code) {
  const hash = crypto.createHash('sha1').update(normKey(code)).digest('hex');
  return `${hash}.json`;
}

// ============================================================================
// Warm Container State + /tmp Persistence (Zero External Dependencies)
// ============================================================================
const DATA_DIR = path.join('/tmp', 'vtp_sync_data');
const INBOUND_DIR = path.join(DATA_DIR, 'inbound');
const OUTBOUND_DIR = path.join(DATA_DIR, 'outbound');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');

const store = {
  serverRevision: 1,
  materialsRevision: 1,
  users: [],
  warehouses: [],
  materials: [],
  inbound: [],
  outbound: [],
  tombstones: createEmptyTombstones(),
  activeSessions: {},
  revokedTokens: {},
  sessionRevokedBefore: {},
  forceLogoutMeta: {}
};

function getRevokedBeforeMs(key, user) {
  return Math.max(
    Number(store.sessionRevokedBefore[key]) || 0,
    Number(user?.sessionRevokedAt) || 0
  );
}

function getLiveActiveSession(key, user, nowMs = Date.now()) {
  const sess = store.activeSessions[key];
  if (!sess || !sess.sessionToken) return undefined;
  const issued = getSessionIssuedAtMs(sess);
  const revokedBefore = getRevokedBeforeMs(key, user);
  if (
    store.revokedTokens[sess.sessionToken] ||
    (revokedBefore > 0 && issued > 0 && issued <= revokedBefore) ||
    nowMs - (sess.lastSeenAt || 0) > ACTIVE_SESSION_TTL_MS
  ) {
    delete store.activeSessions[key];
    return undefined;
  }
  return sess;
}

let cachedMaterialsDigestRev = -1;
let cachedMaterialsDigestVal = '0:0:0:0';

function getMaterialsDigestCached() {
  if (cachedMaterialsDigestRev === store.materialsRevision) {
    return cachedMaterialsDigestVal;
  }
  cachedMaterialsDigestVal = computeMaterialsDigest(store.materials);
  cachedMaterialsDigestRev = store.materialsRevision;
  return cachedMaterialsDigestVal;
}

let initPromise = null;

async function loadDirIntoStore(dirPath, isSeedSource = false) {
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
        const sanitizedUsers = isSeedSource
          ? parsed.users.map((u) => ({ ...u, sessionRevokedAt: undefined }))
          : parsed.users;
        store.users = mergeUsersAdditive(store.users, sanitizedUsers, store.tombstones.users).list;
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
        store.warehouses = mergeWarehousesAdditive(
          store.warehouses,
          parsed.warehouses,
          store.tombstones.warehouses
        ).list;
      }
      if (!isSeedSource) {
        if (parsed.sessionRevokedBefore && typeof parsed.sessionRevokedBefore === 'object') {
          for (const [k, v] of Object.entries(parsed.sessionRevokedBefore)) {
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
          for (const [rawKey, sess] of Object.entries(parsed.activeSessions)) {
            if (sess && sess.sessionToken && !store.revokedTokens[sess.sessionToken]) {
              const cleanKey = normUserKey(sess.username || sess.userKey || rawKey);
              const u = store.users.find((item) => normUserKey(item.username) === cleanKey);
              const revokedBefore = getRevokedBeforeMs(cleanKey, u);
              const sessIssued = getSessionIssuedAtMs(sess);
              if (
                (revokedBefore > 0 && sessIssued > 0 && sessIssued <= revokedBefore) ||
                nowMs - (sess.lastSeenAt || 0) > ACTIVE_SESSION_TTL_MS
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
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(dirMaterials)) {
      const parsed = JSON.parse(await fsp.readFile(dirMaterials, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        store.materials = mergeMaterialsAdditive(
          store.materials,
          parsed,
          store.tombstones.materials
        ).list;
      }
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(dirInbound)) {
      const files = await fsp.readdir(dirInbound);
      const loaded = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const rcp = JSON.parse(await fsp.readFile(path.join(dirInbound, f), 'utf8'));
          if (rcp && rcp.receiptCode) loaded.push(rcp);
        } catch {
          // ignore
        }
      }
      if (loaded.length > 0) {
        store.inbound = mergeInboundReceiptsAdditive(
          store.inbound,
          loaded,
          store.tombstones.inbound
        ).list;
      }
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(dirOutbound)) {
      const files = await fsp.readdir(dirOutbound);
      const loaded = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const rcp = JSON.parse(await fsp.readFile(path.join(dirOutbound, f), 'utf8'));
          if (rcp && rcp.issueCode) loaded.push(rcp);
        } catch {
          // ignore
        }
      }
      if (loaded.length > 0) {
        store.outbound = mergeOutboundReceiptsAdditive(
          store.outbound,
          loaded,
          store.tombstones.outbound
        ).list;
      }
    }
  } catch {
    // ignore
  }
}

async function ensureInitialized() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await fsp.mkdir(INBOUND_DIR, { recursive: true });
    await fsp.mkdir(OUTBOUND_DIR, { recursive: true });

    const repoSeedDir = path.join(process.cwd(), '.sync_data');
    if (fs.existsSync(repoSeedDir)) {
      await loadDirIntoStore(repoSeedDir, true);
    }
    await loadDirIntoStore(DATA_DIR, false);

    if (store.users.length === 0) {
      store.users = mergeUsersAdditive([], INITIAL_SEED_USERS, store.tombstones.users).list;
    }
    if (store.warehouses.length === 0) {
      store.warehouses = mergeWarehousesAdditive(
        [],
        INITIAL_SEED_WAREHOUSES,
        store.tombstones.warehouses
      ).list;
    }
  })();
  return initPromise;
}

async function writeMetaNow() {
  try {
    await fsp.writeFile(
      META_FILE,
      JSON.stringify({
        serverRevision: store.serverRevision,
        materialsRevision: store.materialsRevision,
        users: store.users,
        warehouses: store.warehouses,
        tombstones: store.tombstones,
        activeSessions: store.activeSessions,
        revokedTokens: store.revokedTokens,
        sessionRevokedBefore: store.sessionRevokedBefore,
        forceLogoutMeta: store.forceLogoutMeta
      }),
      'utf8'
    );
  } catch {
    // ignore
  }
}

async function writeMaterialsNow() {
  try {
    await fsp.writeFile(MATERIALS_FILE, JSON.stringify(store.materials), 'utf8');
  } catch {
    // ignore
  }
}

async function writeReceiptsNow(type, codes) {
  const dir = type === 'inbound' ? INBOUND_DIR : OUTBOUND_DIR;
  const list = type === 'inbound' ? store.inbound : store.outbound;
  const map = new Map();
  for (let i = 0; i < list.length; i++) {
    const code = normKey(type === 'inbound' ? list[i].receiptCode || list[i].id : list[i].issueCode || list[i].id);
    map.set(code, list[i]);
  }
  for (const rawCode of codes) {
    const code = normKey(rawCode);
    const filePath = path.join(dir, codeToFileName(code));
    const rcp = map.get(code);
    try {
      if (rcp) {
        await fsp.writeFile(filePath, JSON.stringify(rcp), 'utf8');
      } else if (fs.existsSync(filePath)) {
        await fsp.unlink(filePath);
      }
    } catch {
      // ignore
    }
  }
}

function validateSession(params) {
  const key = normUserKey(String(params.userKey || params.username || ''));
  const token = String(params.sessionToken || '').trim();
  if (!key || !token) {
    return { valid: false, reason: 'missing' };
  }

  const user = store.users.find(
    (u) => normUserKey(u.username) === key || (params.userId && u.id === params.userId)
  );
  if (!user || !user.isActive) {
    if (store.activeSessions[key]) {
      delete store.activeSessions[key];
      void writeMetaNow();
    }
    return { valid: false, reason: 'disabled' };
  }

  const nowMs = Date.now();
  const revokedBefore = getRevokedBeforeMs(key, user);
  let active = store.activeSessions[key];

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
    return { valid: false, reason: 'expired' };
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
    if (active && active.sessionToken && active.sessionToken !== token) {
      store.revokedTokens[active.sessionToken] = tokenIssuedAtMs;
    }
    const upgraded = {
      userId: user.id,
      username: user.username,
      userKey: key,
      sessionToken: token,
      issuedAtMs: tokenIssuedAtMs,
      deviceId: params.deviceId || sigCheck.deviceId || 'dev-recovered',
      deviceLabel: params.deviceLabel || 'Thiết bị hiện tại',
      loginAt: params.loginAt || new Date(tokenIssuedAtMs).toISOString(),
      lastSeenAt: nowMs
    };
    store.activeSessions[key] = upgraded;
    void writeMetaNow();
    return { valid: true, session: upgraded };
  }

  return {
    valid: false,
    reason: 'replaced',
    replacedBy: active
  };
}

async function readJsonBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    if (typeof req.body === 'string' && req.body.length > 0) {
      return JSON.parse(req.body);
    }
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      return JSON.parse(req.body.toString('utf8'));
    }
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-Auth-Invalidated, X-Auth-Replaced-By, X-Auth-Token-Checked'
  );
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v !== undefined) res.setHeader(k, v);
  }
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    await ensureInitialized();

    const urlObj = new URL(req.url || '/', 'http://localhost');
    const rewrittenRoute = urlObj.searchParams.get('__route');
    const route = rewrittenRoute
      ? `/api/${rewrittenRoute.replace(/^\/+/, '')}`
      : urlObj.pathname;
    const method = (req.method || 'GET').toUpperCase();

    const syncHeaders = {};

    // Kiểm tra hiệu lực phiên đơn điệu trên mọi API /api/sync/*
    if (route.startsWith('/api/sync/')) {
      const rawUserKey = req.headers['x-auth-user-key'];
      const rawToken = req.headers['x-auth-session-token'];
      const rawDeviceId = req.headers['x-auth-device-id'];
      const rawDeviceLabel = req.headers['x-auth-device-label'];

      const key = normUserKey(typeof rawUserKey === 'string' ? decodeURIComponent(rawUserKey) : '');
      const token = typeof rawToken === 'string' ? rawToken.trim() : '';
      const deviceId = typeof rawDeviceId === 'string' ? decodeURIComponent(rawDeviceId) : undefined;
      const deviceLabel =
        typeof rawDeviceLabel === 'string' ? decodeURIComponent(rawDeviceLabel) : undefined;

      if (key && token) {
        const isReadSync = method === 'GET' || route === '/api/sync/receipts-batch-pull';
        const check = validateSession({
          userKey: key,
          sessionToken: token,
          deviceId,
          deviceLabel
        });

        if (!check.valid) {
          const reason = check.reason || 'expired';
          syncHeaders['X-Auth-Invalidated'] = reason;
          syncHeaders['X-Auth-Token-Checked'] = token;
          if (check.replacedBy) {
            syncHeaders['X-Auth-Replaced-By'] = encodeURIComponent(JSON.stringify(check.replacedBy));
          } else if (check.forceLogoutBy) {
            syncHeaders['X-Auth-Replaced-By'] = encodeURIComponent(
              JSON.stringify({
                deviceLabel: check.forceLogoutBy.deviceLabel,
                loginAt: check.forceLogoutBy.at
              })
            );
          }
          if (!isReadSync) {
            sendJson(
              res,
              401,
              { error: 'Session invalid', reason, replacedBy: check.replacedBy },
              syncHeaders
            );
            return;
          }
        }
      }
    }

    // 1. POST /api/auth/login
    if (route === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const {
        username,
        password,
        deviceId,
        deviceLabel,
        localUsers,
        forceLogoutOtherDevice
      } = body || {};
      const trimmedUser = String(username || '').trim();
      const passStr = String(password ?? '');

      if (!trimmedUser || !passStr) {
        sendJson(res, 200, {
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
        sendJson(res, 200, {
          success: false,
          message: `Tài khoản "${trimmedUser}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại!`
        });
        return;
      }

      const user = store.users[matchedIdx];
      if (!user.isActive) {
        sendJson(res, 200, {
          success: false,
          message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt. Vui lòng liên hệ Admin.'
        });
        return;
      }

      if ((user.password || '') !== passStr) {
        sendJson(res, 200, {
          success: false,
          message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
        });
        return;
      }

      const nowMs = Date.now();
      const userKey = normUserKey(user.username);
      const cleanDeviceId = String(deviceId || `dev-${nowMs}`);
      const cleanDeviceLabel = String(deviceLabel || 'Thiết bị khác');

      const liveOtherSession = getLiveActiveSession(userKey, user, nowMs);
      if (
        liveOtherSession &&
        liveOtherSession.deviceId !== cleanDeviceId &&
        !forceLogoutOtherDevice
      ) {
        const otherLabel = liveOtherSession.deviceLabel || 'Thiết bị khác';
        sendJson(res, 200, {
          success: false,
          conflict: true,
          code: 'ACTIVE_ON_OTHER_DEVICE',
          activeSession: liveOtherSession,
          message: `Tài khoản "${user.username}" hiện đang đăng nhập trên ${otherLabel}. Hệ thống không cho phép một tài khoản đăng nhập cùng lúc trên 2 thiết bị. Vui lòng nhấn "Yêu cầu đăng xuất trên thiết bị kia" để tiếp tục.`
        });
        return;
      }

      const prevSession = store.activeSessions[userKey];
      const prevIssuedAt = getSessionIssuedAtMs(prevSession);
      const prevRevoked = getRevokedBeforeMs(userKey, user);
      const issuedAtMs = Math.max(nowMs, prevIssuedAt + 2, prevRevoked + 2);
      const revokedAt = issuedAtMs - 1;
      const nowIso = new Date(issuedAtMs).toISOString();
      const sessionToken = createSignedSessionToken(userKey, cleanDeviceId, issuedAtMs);

      if (prevSession && prevSession.sessionToken) {
        store.revokedTokens[prevSession.sessionToken] = issuedAtMs;
      }
      store.sessionRevokedBefore[userKey] = revokedAt;
      delete store.forceLogoutMeta[userKey];

      const replacedPrevious =
        liveOtherSession && liveOtherSession.deviceId !== cleanDeviceId
          ? { ...liveOtherSession }
          : undefined;

      const updatedUser = {
        ...user,
        lastLogin: nowIso,
        sessionRevokedAt: revokedAt,
        updatedAt: Math.max(issuedAtMs, Number(user.updatedAt || 0) + 1)
      };
      store.users[matchedIdx] = updatedUser;

      const session = {
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
      await writeMetaNow();

      sendJson(res, 200, {
        success: true,
        message: replacedPrevious
          ? `Đã đăng xuất phiên trên "${replacedPrevious.deviceLabel || 'thiết bị kia'}" và đăng nhập thành công trên thiết bị hiện tại!`
          : 'Đăng nhập thành công!',
        user: updatedUser,
        session,
        replacedSession: replacedPrevious,
        users: store.users
      });
      return;
    }

    // 2. POST /api/auth/logout
    if (route === '/api/auth/logout' && method === 'POST') {
      const body = await readJsonBody(req);
      const { userKey, username, sessionToken, deviceId } = body || {};
      const key = normUserKey(String(userKey || username || ''));
      const token = String(sessionToken || '').trim();
      const nowMs = Date.now();

      if (token) {
        store.revokedTokens[token] = nowMs;
      }

      if (key) {
        const userIdx = store.users.findIndex((u) => normUserKey(u.username) === key);
        const user = userIdx >= 0 ? store.users[userIdx] : undefined;
        const sigCheck = token ? verifySignedSessionToken(token, key, deviceId) : null;
        const tokenIssuedAtMs = sigCheck?.validSignature ? sigCheck.issuedAtMs : 0;

        const currentActive = store.activeSessions[key];
        const activeMatchesToken = Boolean(
          token && currentActive && currentActive.sessionToken === token
        );
        const activeIsOlderOrEqual =
          tokenIssuedAtMs > 0 &&
          currentActive &&
          getSessionIssuedAtMs(currentActive) <= tokenIssuedAtMs;

        if (activeMatchesToken || activeIsOlderOrEqual) {
          delete store.activeSessions[key];
        }

        if (tokenIssuedAtMs > 0) {
          const nextRevoked = Math.max(getRevokedBeforeMs(key, user), tokenIssuedAtMs);
          store.sessionRevokedBefore[key] = nextRevoked;
          if (userIdx >= 0 && user && (Number(user.sessionRevokedAt) || 0) < nextRevoked) {
            store.users[userIdx] = {
              ...user,
              sessionRevokedAt: nextRevoked,
              updatedAt: Math.max(nowMs, Number(user.updatedAt || 0) + 1)
            };
          }
        }

        store.serverRevision++;
        await writeMetaNow();
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // 2b. POST /api/auth/force-logout
    if (route === '/api/auth/force-logout' && method === 'POST') {
      const body = await readJsonBody(req);
      const {
        keepCurrentSession,
        username,
        password,
        userKey: rawUserKey,
        userId,
        sessionToken,
        deviceId,
        deviceLabel,
        localUsers
      } = body || {};

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
          sendJson(res, 200, {
            success: false,
            message: 'Phiên đăng nhập hiện tại không còn hiệu lực. Vui lòng đăng nhập lại.'
          });
          return;
        }

        const key = check.session.userKey;
        const userIdx = store.users.findIndex((u) => normUserKey(u.username) === key);
        if (userIdx === -1) {
          sendJson(res, 200, {
            success: false,
            message: 'Không tìm thấy tài khoản người dùng.'
          });
          return;
        }

        const user = store.users[userIdx];
        const currIssuedAt = getSessionIssuedAtMs(check.session);
        const prevRevoked = getRevokedBeforeMs(key, user);
        const issuedAtMs = Math.max(nowMs, currIssuedAt + 2, prevRevoked + 2);
        const revokedAt = issuedAtMs - 1;
        const nowIso = new Date(issuedAtMs).toISOString();
        const newSessionToken = createSignedSessionToken(key, cleanDeviceId, issuedAtMs);

        store.revokedTokens[check.session.sessionToken] = issuedAtMs;
        store.sessionRevokedBefore[key] = revokedAt;
        store.forceLogoutMeta[key] = { at: nowIso, deviceLabel: cleanDeviceLabel };

        const updatedUser = {
          ...user,
          sessionRevokedAt: revokedAt,
          updatedAt: Math.max(issuedAtMs, Number(user.updatedAt || 0) + 1)
        };
        store.users[userIdx] = updatedUser;

        const newSession = {
          userId: updatedUser.id,
          username: updatedUser.username,
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
        await writeMetaNow();

        sendJson(res, 200, {
          success: true,
          message: 'Đã gửi yêu cầu đăng xuất thành công tới mọi thiết bị khác!',
          user: updatedUser,
          session: newSession,
          users: store.users
        });
        return;
      }

      const trimmedUser = String(username || '').trim();
      const passStr = String(password ?? '');

      if (!trimmedUser || !passStr) {
        sendJson(res, 200, {
          success: false,
          message:
            'Vui lòng nhập tên người sử dụng và mật khẩu để xác thực yêu cầu đăng xuất thiết bị kia.'
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
        sendJson(res, 200, {
          success: false,
          message: `Tài khoản "${trimmedUser}" không tồn tại trong hệ thống.`
        });
        return;
      }

      const user = store.users[matchedIdx];
      if (!user.isActive) {
        sendJson(res, 200, {
          success: false,
          message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt.'
        });
        return;
      }

      if ((user.password || '') !== passStr) {
        sendJson(res, 200, {
          success: false,
          message: 'Mật khẩu xác thực không chính xác. Không thể gửi yêu cầu đăng xuất thiết bị kia.'
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

      const updatedUser = {
        ...user,
        sessionRevokedAt: revokedAt,
        updatedAt: Math.max(revokedAt, Number(user.updatedAt || 0) + 1)
      };
      store.users[matchedIdx] = updatedUser;
      store.serverRevision++;
      await writeMetaNow();

      const targetLabel = prevActive?.deviceLabel;
      sendJson(res, 200, {
        success: true,
        hadActiveSession: Boolean(prevActive),
        loggedOutDeviceLabel: targetLabel,
        users: store.users,
        message: targetLabel
          ? `Đã yêu cầu đăng xuất thành công phiên trên "${targetLabel}". Bạn có thể nhấn Đăng nhập ngay bây giờ!`
          : 'Đã thu hồi toàn bộ phiên đăng nhập trên các thiết bị khác. Bạn có thể nhấn Đăng nhập ngay bây giờ!'
      });
      return;
    }

    // 3. POST /api/auth/verify-session
    if (route === '/api/auth/verify-session' && method === 'POST') {
      const body = await readJsonBody(req);
      const { userId, username, userKey, sessionToken, deviceId, deviceLabel, loginAt } =
        body || {};
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
        sendJson(res, 200, {
          valid: false,
          reason: check.reason || 'expired',
          replacedBy: check.replacedBy,
          forceLogoutBy: check.forceLogoutBy
        });
        return;
      }

      sendJson(res, 200, { valid: true, session: check.session });
      return;
    }

    // 4. GET /api/sync/manifest
    if (route === '/api/sync/manifest' && method === 'GET') {
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

      sendJson(
        res,
        200,
        {
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
        },
        syncHeaders
      );
      return;
    }

    // 5. POST /api/sync/meta
    if (route === '/api/sync/meta' && method === 'POST') {
      const body = await readJsonBody(req);
      const { users, warehouses, tombstones } = body || {};
      let anyChanged = false;

      if (tombstones && mergeTombstones(store.tombstones, tombstones)) {
        anyChanged = true;
        const cleanIn = mergeInboundReceiptsAdditive(store.inbound, [], store.tombstones.inbound);
        if (cleanIn.changed) {
          const prevCodes = store.inbound.map((r) => normKey(r.receiptCode || r.id));
          store.inbound = cleanIn.list;
          await writeReceiptsNow('inbound', prevCodes);
        }
        const cleanOut = mergeOutboundReceiptsAdditive(
          store.outbound,
          [],
          store.tombstones.outbound
        );
        if (cleanOut.changed) {
          const prevCodes = store.outbound.map((r) => normKey(r.issueCode || r.id));
          store.outbound = cleanOut.list;
          await writeReceiptsNow('outbound', prevCodes);
        }
        const cleanMat = mergeMaterialsAdditive(store.materials, [], store.tombstones.materials);
        if (cleanMat.changed) {
          store.materials = cleanMat.list;
          store.materialsRevision++;
          await writeMaterialsNow();
        }
      }

      if (Array.isArray(users)) {
        const mergedU = mergeUsersAdditive(store.users, users, store.tombstones.users);
        if (mergedU.changed) {
          store.users = mergedU.list;
          anyChanged = true;
        }
      }

      const validActiveUserKeys = new Set();
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
        }
      }
      for (const sKey of Object.keys(store.activeSessions)) {
        if (!validActiveUserKeys.has(sKey) && store.tombstones.users[sKey]) {
          delete store.activeSessions[sKey];
          anyChanged = true;
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
        await writeMetaNow();
      }

      sendJson(
        res,
        200,
        {
          ok: true,
          changed: anyChanged,
          serverRevision: store.serverRevision,
          metaDigest: computeMetaDigest(store.users, store.warehouses, store.tombstones),
          users: store.users,
          warehouses: store.warehouses,
          tombstones: store.tombstones
        },
        syncHeaders
      );
      return;
    }

    // 6. GET & POST /api/sync/materials
    if (route === '/api/sync/materials' && method === 'GET') {
      const offset = Math.max(0, Number(urlObj.searchParams.get('offset')) || 0);
      const limit = Math.min(3500, Math.max(100, Number(urlObj.searchParams.get('limit')) || 3500));
      const slice = store.materials.slice(offset, offset + limit);
      sendJson(
        res,
        200,
        {
          items: slice,
          total: store.materials.length,
          hasMore: offset + slice.length < store.materials.length,
          materialsRevision: store.materialsRevision,
          materialsDigest: getMaterialsDigestCached()
        },
        syncHeaders
      );
      return;
    }

    if (route === '/api/sync/materials' && method === 'POST') {
      const body = await readJsonBody(req);
      const { items, tombstones } = body || {};
      let changed = false;

      if (tombstones && mergeTombstones(store.tombstones, { materials: tombstones })) {
        changed = true;
      }

      if (Array.isArray(items) && items.length > 0) {
        const merged = mergeMaterialsAdditive(store.materials, items, store.tombstones.materials);
        if (merged.changed) {
          store.materials = merged.list;
          changed = true;
        }
      } else if (changed) {
        store.materials = mergeMaterialsAdditive(
          store.materials,
          [],
          store.tombstones.materials
        ).list;
      }

      if (changed) {
        store.materialsRevision++;
        store.serverRevision++;
        await writeMaterialsNow();
        await writeMetaNow();
      }

      sendJson(
        res,
        200,
        {
          ok: true,
          changed,
          materialsCount: store.materials.length,
          materialsRevision: store.materialsRevision,
          materialsDigest: getMaterialsDigestCached(),
          serverRevision: store.serverRevision
        },
        syncHeaders
      );
      return;
    }

    // 7. POST /api/sync/receipts-push
    if (route === '/api/sync/receipts-push' && method === 'POST') {
      const body = await readJsonBody(req);
      const { type, receipts } = body || {};
      if ((type !== 'inbound' && type !== 'outbound') || !Array.isArray(receipts)) {
        sendJson(res, 400, { error: 'Invalid payload' }, syncHeaders);
        return;
      }

      let changed = false;
      if (type === 'inbound') {
        const merged = mergeInboundReceiptsAdditive(
          store.inbound,
          receipts,
          store.tombstones.inbound
        );
        if (merged.changed) {
          store.inbound = merged.list;
          changed = true;
          await writeReceiptsNow('inbound', merged.touchedCodes);
        }
      } else {
        const merged = mergeOutboundReceiptsAdditive(
          store.outbound,
          receipts,
          store.tombstones.outbound
        );
        if (merged.changed) {
          store.outbound = merged.list;
          changed = true;
          await writeReceiptsNow('outbound', merged.touchedCodes);
        }
      }

      if (changed) {
        store.serverRevision++;
        await writeMetaNow();
      }

      sendJson(res, 200, { ok: true, changed, serverRevision: store.serverRevision }, syncHeaders);
      return;
    }

    // 8. POST /api/sync/receipts-batch-pull
    if (route === '/api/sync/receipts-batch-pull' && method === 'POST') {
      const body = await readJsonBody(req);
      const { type, codes } = body || {};
      if ((type !== 'inbound' && type !== 'outbound') || !Array.isArray(codes)) {
        sendJson(res, 400, { error: 'Invalid request' }, syncHeaders);
        return;
      }

      const MAX_ITEMS_PER_RESPONSE = 3500;
      let itemsCount = 0;
      const returnedReceipts = [];
      const remainingLargeCodes = [];
      const unprocessedCodes = [];

      const list = type === 'inbound' ? store.inbound : store.outbound;
      const map = new Map();
      for (let i = 0; i < list.length; i++) {
        const k = normKey(
          type === 'inbound' ? list[i].receiptCode || list[i].id : list[i].issueCode || list[i].id
        );
        map.set(k, list[i]);
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

      sendJson(
        res,
        200,
        { receipts: returnedReceipts, remainingLargeCodes, unprocessedCodes },
        syncHeaders
      );
      return;
    }

    // 9. GET /api/sync/receipt-chunk
    if (route === '/api/sync/receipt-chunk' && method === 'GET') {
      const type = String(urlObj.searchParams.get('type') || '');
      const code = normKey(urlObj.searchParams.get('code') || '');
      const offset = Math.max(0, Number(urlObj.searchParams.get('offset')) || 0);
      const limit = Math.min(3500, Math.max(500, Number(urlObj.searchParams.get('limit')) || 3500));

      if (type !== 'inbound' && type !== 'outbound') {
        sendJson(res, 400, { error: 'Invalid type' }, syncHeaders);
        return;
      }

      const list = type === 'inbound' ? store.inbound : store.outbound;
      const rcp = list.find(
        (r) => normKey(type === 'inbound' ? r.receiptCode || r.id : r.issueCode || r.id) === code
      );
      if (!rcp) {
        sendJson(res, 404, { error: 'Receipt not found' }, syncHeaders);
        return;
      }

      const itemsSlice = rcp.items.slice(offset, offset + limit);
      sendJson(
        res,
        200,
        {
          receipt: { ...rcp, items: itemsSlice },
          nextOffset: offset + itemsSlice.length,
          totalItems: rcp.items.length,
          hasMore: offset + itemsSlice.length < rcp.items.length
        },
        syncHeaders
      );
      return;
    }

    sendJson(res, 404, { error: `Unknown API route: ${route}` });
  } catch (err) {
    console.error('Vercel API handler error:', err);
    sendJson(res, 500, {
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err)
    });
  }
}
