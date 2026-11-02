import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SESSION_HMAC_SECRET =
  process.env.SESSION_SECRET || 'vtp-inventory-single-device-hmac-secret-2026-v2';

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
      `U|${normUserKey(u.username)}|${u.id}|${u.fullName}|${u.role}|${u.password || ''}|${u.isActive ? 1 : 0}|${u.phone || ''}|${u.email || ''}|${u.department || ''}|${Number(u.updatedAt) || 0}`
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
  const [hh1, hh2] = hashPair(
    `IH|${normKey(rcp.receiptCode || rcp.id)}|${rcp.receiptDate || ''}|${rcp.warehouseId || ''}|${rcp.warehouseName || ''}|${rcp.departmentName || ''}|${rcp.contractNo || ''}|${rcp.requestNo || ''}|${rcp.inboundType || ''}|${rcp.amountInWords || ''}|${rcp.attachedDocs || ''}|${rcp.supplier || ''}|${rcp.manufacturer || ''}|${rcp.shipment || ''}|${rcp.packingListNo || ''}|${rcp.delivererName || ''}|${rcp.receiverName || ''}|${rcp.driverVehicleNo || ''}|${rcp.notes || ''}|${Number(rcp.totalQuantity) || 0}|${Number(rcp.totalWeightKg) || 0}`
  );
  let sum1 = hh1;
  let sum2 = hh2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const [h1, h2] = hashPair(
      `${it.id || ''}|${it.materialCode || ''}|${it.batchCode || ''}|${it.packingListNo || ''}|${it.shipment || ''}|${it.packageNo || ''}|${it.drawingNo || ''}|${Number(it.quantity) || 0}|${Number(it.weightKg) || 0}|${it.note || ''}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
  }
  return `${items.length}:${sum1.toString(36)}:${sum2.toString(36)}`;
}

function computeOutboundReceiptDigest(rcp) {
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const [hh1, hh2] = hashPair(
    `OH|${normKey(rcp.issueCode || rcp.id)}|${rcp.issueDate || ''}|${rcp.warehouseId || ''}|${rcp.warehouseName || ''}|${rcp.departmentName || ''}|${rcp.requestNo || ''}|${rcp.outboundType || ''}|${rcp.projectName || ''}|${rcp.recipientDepartment || ''}|${rcp.recipientName || ''}|${rcp.issuerName || ''}|${rcp.notes || ''}|${Number(rcp.totalQuantity) || 0}|${Number(rcp.totalWeightKg) || 0}`
  );
  let sum1 = hh1;
  let sum2 = hh2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const [h1, h2] = hashPair(
      `${it.id || ''}|${it.materialCode || ''}|${it.batchCode || ''}|${it.packingListNo || ''}|${it.shipment || ''}|${it.packageNo || ''}|${it.drawingNo || ''}|${Number(it.quantity) || 0}|${Number(it.weightKg) || 0}|${it.note || ''}`
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
      if (incTs > currTs) {
        const nextUser = {
          ...curr,
          ...inc,
          password: inc.password || curr.password,
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
          mergedPass !== curr.password
        ) {
          result[existIdx] = {
            ...curr,
            fullName: mergedFullName,
            email: mergedEmail,
            phone: mergedPhone,
            department: mergedDept,
            password: mergedPass
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

function makeItemSig(it) {
  if (it.id) return it.id;
  return `${it.materialCode}__${it.packingListNo}__${it.packageNo}__${it.drawingNo}__${it.quantity}__${it.weightKg}`;
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
    existingFiltered.push(r);
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
      let totalQty = 0;
      let totalWeight = 0;
      let totalAmt = 0;
      let pkgCount = 0;
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const q = Number(it.quantity) || 0;
        const w = Number(it.weightKg) || 0;
        totalQty += q;
        totalWeight += w;
        totalAmt += Number(it.totalPrice) || q * (Number(it.unitPrice) || 0);
        if (it.packageNo) pkgCount++;
      }

      const cleanReceipt = {
        ...inc,
        items,
        packageCount: pkgCount,
        totalQuantity: totalQty,
        totalWeightKg: Math.round(totalWeight * 100) / 100,
        totalAmount: totalAmt,
        updatedAt: Number(inc.updatedAt) || 1
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

      const seenItemSigs = new Set();
      for (let j = 0; j < curr.items.length; j++) {
        seenItemSigs.add(makeItemSig(curr.items[j]));
      }

      const addedItems = [];
      for (let j = 0; j < incItems.length; j++) {
        const sig = makeItemSig(incItems[j]);
        if (!seenItemSigs.has(sig)) {
          seenItemSigs.add(sig);
          addedItems.push(incItems[j]);
        }
      }

      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const headerNewer = incTs > currTs;

      if (addedItems.length > 0 || headerNewer) {
        const mergedItems = addedItems.length > 0 ? curr.items.concat(addedItems) : curr.items;
        let totalQty = 0;
        let totalWeight = 0;
        let totalAmt = 0;
        let pkgCount = 0;
        for (let j = 0; j < mergedItems.length; j++) {
          const it = mergedItems[j];
          const q = Number(it.quantity) || 0;
          const w = Number(it.weightKg) || 0;
          totalQty += q;
          totalWeight += w;
          totalAmt += Number(it.totalPrice) || q * (Number(it.unitPrice) || 0);
          if (it.packageNo) pkgCount++;
        }

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
          packageCount: pkgCount,
          totalQuantity: totalQty,
          totalWeightKg: Math.round(totalWeight * 100) / 100,
          totalAmount: totalAmt,
          updatedAt: Math.max(currTs, incTs) || 1
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
    existingFiltered.push(r);
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
      let totalQty = 0;
      let totalWeight = 0;
      for (let j = 0; j < items.length; j++) {
        totalQty += Number(items[j].quantity) || 0;
        totalWeight += Number(items[j].weightKg) || 0;
      }

      const cleanReceipt = {
        ...inc,
        items,
        packingListSummary: inc.packingListSummary || computePackingListSummary(items),
        totalQuantity: totalQty,
        totalWeightKg: Math.round(totalWeight * 100) / 100,
        updatedAt: Number(inc.updatedAt) || 1
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

      const seenItemSigs = new Set();
      for (let j = 0; j < curr.items.length; j++) {
        seenItemSigs.add(makeItemSig(curr.items[j]));
      }

      const addedItems = [];
      for (let j = 0; j < incItems.length; j++) {
        const sig = makeItemSig(incItems[j]);
        if (!seenItemSigs.has(sig)) {
          seenItemSigs.add(sig);
          addedItems.push(incItems[j]);
        }
      }

      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const headerNewer = incTs > currTs;

      if (addedItems.length > 0 || headerNewer) {
        const mergedItems = addedItems.length > 0 ? curr.items.concat(addedItems) : curr.items;
        let totalQty = 0;
        let totalWeight = 0;
        for (let j = 0; j < mergedItems.length; j++) {
          totalQty += Number(mergedItems[j].quantity) || 0;
          totalWeight += Number(mergedItems[j].weightKg) || 0;
        }

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
          totalQuantity: totalQty,
          totalWeightKg: Math.round(totalWeight * 100) / 100,
          updatedAt: Math.max(currTs, incTs) || 1
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

function createSignedSessionToken(userKey, deviceId, issuedAtMs) {
  const nonce = crypto.randomUUID();
  const sig = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(`${userKey}|${deviceId}|${nonce}|${issuedAtMs}`)
    .digest('hex')
    .slice(0, 24);
  return `${nonce}.${issuedAtMs}.${sig}`;
}

function verifySignedSessionToken(token, userKey, deviceId) {
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
  revokedTokens: {}
};

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

async function loadDirIntoStore(dirPath) {
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
        store.users = mergeUsersAdditive(store.users, parsed.users, store.tombstones.users).list;
      }
      if (Array.isArray(parsed.warehouses)) {
        store.warehouses = mergeWarehousesAdditive(
          store.warehouses,
          parsed.warehouses,
          store.tombstones.warehouses
        ).list;
      }
      if (parsed.activeSessions && typeof parsed.activeSessions === 'object') {
        for (const [rawKey, sess] of Object.entries(parsed.activeSessions)) {
          if (sess && sess.sessionToken) {
            const cleanKey = normUserKey(sess.username || sess.userKey || rawKey);
            const existing = store.activeSessions[cleanKey];
            if (!existing || (sess.lastSeenAt || 0) >= (existing.lastSeenAt || 0)) {
              store.activeSessions[cleanKey] = { ...sess, userKey: cleanKey };
            }
          }
        }
      }
      if (parsed.revokedTokens && typeof parsed.revokedTokens === 'object') {
        Object.assign(store.revokedTokens, parsed.revokedTokens);
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
      await loadDirIntoStore(repoSeedDir);
    }
    await loadDirIntoStore(DATA_DIR);

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
        revokedTokens: store.revokedTokens
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

function tryRecoverServerlessSession(key, user, sessionToken, deviceId, deviceLabel, loginAt) {
  if (!deviceId || store.revokedTokens[sessionToken]) return null;
  const { validSignature, issuedAtMs } = verifySignedSessionToken(sessionToken, key, deviceId);
  if (!validSignature) return null;

  const userLastLoginMs = user.lastLogin ? Date.parse(user.lastLogin) : 0;
  if (userLastLoginMs > 0 && issuedAtMs + 1500 < userLastLoginMs) {
    return null;
  }

  const recovered = {
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
  void writeMetaNow();
  return recovered;
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
  res.setHeader('Access-Control-Expose-Headers', 'X-Auth-Invalidated, X-Auth-Replaced-By');
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

    // Kiểm tra hiệu lực phiên trên mọi API /api/sync/*
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
        const user = store.users.find((u) => normUserKey(u.username) === key);

        if (!user || !user.isActive) {
          syncHeaders['X-Auth-Invalidated'] = 'disabled';
          if (!isReadSync) {
            sendJson(res, 401, { error: 'Account disabled', reason: 'disabled' }, syncHeaders);
            return;
          }
        } else {
          let active = store.activeSessions[key];
          if (!active) {
            active = tryRecoverServerlessSession(key, user, token, deviceId, deviceLabel);
          }
          if (!active) {
            syncHeaders['X-Auth-Invalidated'] = 'expired';
            if (!isReadSync) {
              sendJson(res, 401, { error: 'Session expired', reason: 'expired' }, syncHeaders);
              return;
            }
          } else if (active.sessionToken !== token) {
            syncHeaders['X-Auth-Invalidated'] = 'replaced';
            syncHeaders['X-Auth-Replaced-By'] = encodeURIComponent(JSON.stringify(active));
            if (!isReadSync) {
              sendJson(
                res,
                401,
                { error: 'Session replaced', reason: 'replaced', replacedBy: active },
                syncHeaders
              );
              return;
            }
          } else {
            active.lastSeenAt = Date.now();
          }
        }
      }
    }

    // 1. POST /api/auth/login
    if (route === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const { username, password, deviceId, deviceLabel, localUsers } = body || {};
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
        (previousSession.deviceId !== cleanDeviceId ||
          nowMs - (previousSession.lastSeenAt || 0) <= 15000)
          ? { ...previousSession }
          : undefined;

      const updatedUser = {
        ...user,
        lastLogin: nowIso,
        updatedAt: Math.max(nowMs, Number(user.updatedAt || 0) + 1)
      };
      store.users[matchedIdx] = updatedUser;

      const session = {
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
      await writeMetaNow();

      sendJson(res, 200, {
        success: true,
        message: replacedPrevious
          ? `Đăng nhập thành công! Hệ thống đã tự động đăng xuất phiên đang mở trên ${replacedPrevious.deviceLabel || 'thiết bị khác'}.`
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
      const { userKey, sessionToken } = body || {};
      const key = normUserKey(String(userKey || ''));
      if (sessionToken) {
        store.revokedTokens[String(sessionToken)] = Date.now();
      }
      if (key && store.activeSessions[key]) {
        if (sessionToken && store.activeSessions[key].sessionToken === sessionToken) {
          delete store.activeSessions[key];
          store.serverRevision++;
          await writeMetaNow();
        }
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // 3. POST /api/auth/verify-session
    if (route === '/api/auth/verify-session' && method === 'POST') {
      const body = await readJsonBody(req);
      const { userId, username, userKey, sessionToken, deviceId, deviceLabel, loginAt } =
        body || {};
      const key = normUserKey(String(userKey || username || ''));
      if (!key || !sessionToken) {
        sendJson(res, 200, { valid: false, reason: 'missing' });
        return;
      }

      const user = store.users.find((u) => normUserKey(u.username) === key || u.id === userId);
      if (!user || !user.isActive) {
        if (store.activeSessions[key]) {
          delete store.activeSessions[key];
          await writeMetaNow();
        }
        sendJson(res, 200, { valid: false, reason: 'disabled' });
        return;
      }

      let active = store.activeSessions[key];
      if (!active) {
        active = tryRecoverServerlessSession(
          key,
          user,
          String(sessionToken),
          deviceId ? String(deviceId) : undefined,
          deviceLabel ? String(deviceLabel) : undefined,
          loginAt ? String(loginAt) : undefined
        );
      }

      if (!active) {
        sendJson(res, 200, { valid: false, reason: 'expired' });
        return;
      }

      if (active.sessionToken !== sessionToken) {
        sendJson(res, 200, {
          valid: false,
          reason: 'replaced',
          replacedBy: active
        });
        return;
      }

      active.lastSeenAt = Date.now();
      sendJson(res, 200, { valid: true, session: active });
      return;
    }

    // 4. GET /api/sync/manifest
    if (route === '/api/sync/manifest' && method === 'GET') {
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
        if (u.isActive) {
          validActiveUserKeys.add(uKey);
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
