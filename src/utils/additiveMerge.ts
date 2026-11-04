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

export function foldVietnameseAscii(raw: string | undefined | null): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
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

export function computeEmailAuthDigest(email: string | undefined | null): string {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return '';
  const [h1, h2] = hashPair(`VTP_EMAIL_AUTH_V1|${clean}`);
  const [h3, h4] = hashPair(`VTP_EMAIL_SALT_V2|${clean.split('').reverse().join('')}`);
  return `em_${h1.toString(36)}_${h2.toString(36)}_${h3.toString(36)}_${h4.toString(36)}`;
}

export const BOOTSTRAPPED_ADMIN_EMAIL = 'voduongphu@gmail.com';
const BOOTSTRAPPED_ADMIN_DIGEST = computeEmailAuthDigest(BOOTSTRAPPED_ADMIN_EMAIL);

export function isBootstrappedAdminUser(u?: Partial<User> | null): boolean {
  if (!u) return false;
  if (u.id === 'user-admin-01') return true;
  const uKey = normUserKey(u.username);
  if (uKey === 'võ dương phú' || uKey === 'vo duong phu') return true;
  const em = (u.email || '').trim().toLowerCase();
  if (em === BOOTSTRAPPED_ADMIN_EMAIL) return true;
  if (u.emailDigest && u.emailDigest === BOOTSTRAPPED_ADMIN_DIGEST) return true;
  return false;
}

export interface GoogleIdentityInput {
  email: string;
  displayName?: string | null;
  uid?: string | null;
  nowMs?: number;
}

export interface ResolvedGoogleUserResult {
  allowed: boolean;
  isNew: boolean;
  mutated: boolean;
  user: User;
  message?: string;
}

export function resolveGoogleUserRecord(
  users: User[],
  input: GoogleIdentityInput
): ResolvedGoogleUserResult {
  const nowMs = Number(input.nowMs) > 0 ? Number(input.nowMs) : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const emailLower = (input.email || '').trim().toLowerCase();
  const emailDigest = computeEmailAuthDigest(emailLower);
  const cleanDisplay = (input.displayName || '').normalize('NFC').trim();
  const safeUsers = Array.isArray(users) ? users : [];

  if (emailLower === BOOTSTRAPPED_ADMIN_EMAIL) {
    const existingAdmin = safeUsers.find((u) => isBootstrappedAdminUser(u));
    if (existingAdmin) {
      const nextFullName =
        existingAdmin.fullName?.trim() || cleanDisplay || 'Võ Dương Phú (Tổng Quản Trị)';
      const needsUpdate =
        existingAdmin.role !== 'admin' ||
        !existingAdmin.isActive ||
        (existingAdmin.email || '').trim().toLowerCase() !== BOOTSTRAPPED_ADMIN_EMAIL ||
        existingAdmin.emailDigest !== emailDigest ||
        existingAdmin.fullName !== nextFullName;

      const adminUser: User = needsUpdate
        ? {
            ...existingAdmin,
            fullName: nextFullName,
            role: 'admin',
            isActive: true,
            email: BOOTSTRAPPED_ADMIN_EMAIL,
            emailDigest,
            password: existingAdmin.password || 'google-oauth',
            updatedAt: Math.max(nowMs, (Number(existingAdmin.updatedAt) || 0) + 1)
          }
        : existingAdmin;

      return {
        allowed: true,
        isNew: false,
        mutated: needsUpdate,
        user: adminUser
      };
    }

    return {
      allowed: true,
      isNew: true,
      mutated: true,
      user: {
        id: 'user-admin-01',
        username: 'Võ Dương Phú',
        fullName: cleanDisplay || 'Võ Dương Phú (Tổng Quản Trị)',
        role: 'admin',
        password: 'google-oauth',
        email: BOOTSTRAPPED_ADMIN_EMAIL,
        emailDigest,
        department: 'Ban Giám Đốc / QL Dự Án',
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowMs
      }
    };
  }

  const matched =
    safeUsers.find(
      (u) =>
        (emailLower && (u.email || '').trim().toLowerCase() === emailLower) ||
        (emailDigest &&
          (u.emailDigest === emailDigest || computeEmailAuthDigest(u.email) === emailDigest))
    ) || safeUsers.find((u) => emailLower && normUserKey(u.username) === emailLower);

  if (matched) {
    if (!matched.isActive) {
      return {
        allowed: false,
        isNew: false,
        mutated: false,
        user: matched,
        message:
          'Tài khoản Google này hiện đang bị khóa hoặc ngừng kích hoạt trên hệ thống. Vui lòng liên hệ Quản trị viên (voduongphu@gmail.com).'
      };
    }

    const nextFullName =
      matched.fullName && normUserKey(matched.fullName) !== normUserKey(matched.username)
        ? matched.fullName
        : cleanDisplay || matched.fullName || matched.username;

    const needsEnrich =
      (matched.email || '').trim().toLowerCase() !== emailLower ||
      matched.emailDigest !== emailDigest ||
      matched.fullName !== nextFullName;

    const enrichedUser: User = needsEnrich
      ? {
          ...matched,
          fullName: nextFullName,
          email: emailLower,
          emailDigest,
          password: matched.password || 'google-oauth',
          updatedAt: Math.max(nowMs, (Number(matched.updatedAt) || 0) + 1)
        }
      : matched;

    return {
      allowed: true,
      isNew: false,
      mutated: needsEnrich,
      user: enrichedUser
    };
  }

  const [h1, h2] = hashPair(`GOOGLE_USER_ID|${emailLower}`);
  const detId = `user-g-${h1.toString(36)}${h2.toString(36)}`;
  const rawLocalPart = emailLower.split('@')[0] || 'user';
  const cleanLocalPart = rawLocalPart.replace(/[^a-z0-9._-]/g, '') || 'user';
  const usernameTaken = safeUsers.some(
    (u) => normUserKey(u.username) === normUserKey(cleanLocalPart)
  );
  const finalUsername = usernameTaken
    ? `${cleanLocalPart}_${h1.toString(36).slice(0, 4)}`
    : cleanLocalPart;

  return {
    allowed: true,
    isNew: true,
    mutated: true,
    user: {
      id: detId,
      username: finalUsername,
      fullName: cleanDisplay || finalUsername,
      role: 'staff',
      password: 'google-oauth',
      email: emailLower,
      emailDigest,
      department: 'Nhân sự Kho vận',
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowMs
    }
  };
}

export function isSessionHeartbeatFresh(
  nowMs: number,
  lastSeenAt: number | undefined | null,
  ttlMs = 90_000
): boolean {
  const seen = Number(lastSeenAt) || 0;
  if (seen <= 0) return false;
  return Math.abs(nowMs - seen) <= ttlMs;
}

export function isPasswordMatch(
  storedPassword: string | undefined | null,
  inputPassword: string | undefined | null
): boolean {
  const stored = String(storedPassword ?? '');
  const input = String(inputPassword ?? '');
  if (!input) return false;
  if (stored === input) return true;
  const trimmedInput = input.trim();
  if (!trimmedInput) return false;
  return stored.trim() === trimmedInput;
}

export function findMatchingUser(users: User[], rawIdentifier: string | undefined | null): User | undefined {
  const inputKey = normUserKey(rawIdentifier);
  if (!inputKey || !Array.isArray(users) || users.length === 0) return undefined;

  // 1. Khớp chính xác theo username chuẩn hóa NFC
  const exactUsername = users.find((u) => normUserKey(u.username) === inputKey);
  if (exactUsername) return exactUsername;

  // 2. Khớp chính xác theo họ tên đầy đủ chuẩn hóa NFC
  const exactFullName = users.find((u) => normUserKey(u.fullName) === inputKey);
  if (exactFullName) return exactFullName;

  // 3. Khớp theo email hoặc emailDigest (hỗ trợ người dùng nhập email vào ô Tên người sử dụng)
  if (inputKey.includes('@')) {
    const targetDigest = computeEmailAuthDigest(inputKey);
    const byEmail = users.find(
      (u) =>
        normUserKey(u.email) === inputKey ||
        (targetDigest && (u.emailDigest === targetDigest || computeEmailAuthDigest(u.email) === targetDigest))
    );
    if (byEmail) return byEmail;
  }

  // 4. Khớp không dấu / chuẩn hóa vị trí dấu tiếng Việt trên máy tính (Windows/macOS Chrome IME) khi không trùng lặp
  const foldedInput = foldVietnameseAscii(rawIdentifier);
  if (!foldedInput) return undefined;

  const foldedUsernameMatches = users.filter((u) => foldVietnameseAscii(u.username) === foldedInput);
  if (foldedUsernameMatches.length === 1) return foldedUsernameMatches[0];

  const foldedFullNameMatches = users.filter((u) => foldVietnameseAscii(u.fullName) === foldedInput);
  if (foldedFullNameMatches.length === 1) return foldedFullNameMatches[0];

  const compactInput = foldedInput.replace(/\s+/g, '');
  if (compactInput.length >= 3) {
    const compactMatches = users.filter(
      (u) =>
        foldVietnameseAscii(u.username).replace(/\s+/g, '') === compactInput ||
        foldVietnameseAscii(u.fullName).replace(/\s+/g, '') === compactInput
    );
    if (compactMatches.length === 1) return compactMatches[0];
  }

  return undefined;
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

// 1. USERS: Đồng bộ cộng gộp theo emailDigest / username / id (không ghi đè mất tài khoản của người khác)
export function mergeUsersAdditive(
  existing: User[],
  incoming: User[],
  tombstones: Record<string, number>
): { list: User[]; changed: boolean } {
  let changed = false;
  const result: User[] = [];
  const indexByUsername = new Map<string, number>();
  const indexById = new Map<string, number>();
  const indexByEmailDigest = new Map<string, number>();

  for (let i = 0; i < existing.length; i++) {
    let u = existing[i];
    const uKey = normUserKey(u.username);
    const isProtectedAdmin = isBootstrappedAdminUser(u);
    const emDigest = u.emailDigest || computeEmailAuthDigest(u.email) || '';
    if (!isProtectedAdmin && isRecordDeleted(tombstones, [u.id, uKey, emDigest], u.updatedAt)) {
      changed = true;
      continue;
    }
    if (isProtectedAdmin && (u.role !== 'admin' || !u.isActive || u.email !== BOOTSTRAPPED_ADMIN_EMAIL || u.emailDigest !== BOOTSTRAPPED_ADMIN_DIGEST)) {
      u = {
        ...u,
        role: 'admin',
        isActive: true,
        email: BOOTSTRAPPED_ADMIN_EMAIL,
        emailDigest: BOOTSTRAPPED_ADMIN_DIGEST
      };
      changed = true;
    }
    const idx = result.length;
    result.push(u);
    const finalEmDigest = u.emailDigest || computeEmailAuthDigest(u.email) || '';
    if (uKey) indexByUsername.set(uKey, idx);
    if (u.id) indexById.set(u.id, idx);
    if (finalEmDigest) indexByEmailDigest.set(finalEmDigest, idx);
  }

  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i];
    if (!inc || (!inc.username && !inc.email)) continue;
    const uKey = normUserKey(inc.username || inc.email);
    const incEmDigest = inc.emailDigest || computeEmailAuthDigest(inc.email) || '';
    const isProtectedAdmin = isBootstrappedAdminUser(inc);
    if (!isProtectedAdmin && isRecordDeleted(tombstones, [inc.id, uKey, incEmDigest], inc.updatedAt)) {
      continue;
    }

    let existIdx = incEmDigest ? indexByEmailDigest.get(incEmDigest) : undefined;
    if (existIdx === undefined && uKey) {
      existIdx = indexByUsername.get(uKey);
    }
    if (existIdx === undefined && inc.id) {
      existIdx = indexById.get(inc.id);
    }
    if (existIdx === undefined && isProtectedAdmin) {
      existIdx = result.findIndex((x) => isBootstrappedAdminUser(x));
      if (existIdx === -1) existIdx = undefined;
    }

    if (existIdx === undefined) {
      const normalizedInc: User = isProtectedAdmin
        ? {
            ...inc,
            role: 'admin',
            isActive: true,
            email: BOOTSTRAPPED_ADMIN_EMAIL,
            emailDigest: BOOTSTRAPPED_ADMIN_DIGEST
          }
        : incEmDigest && !inc.emailDigest
          ? { ...inc, emailDigest: incEmDigest }
          : inc;
      const idx = result.length;
      result.push(normalizedInc);
      if (uKey) indexByUsername.set(uKey, idx);
      if (normalizedInc.id) indexById.set(normalizedInc.id, idx);
      if (normalizedInc.emailDigest) indexByEmailDigest.set(normalizedInc.emailDigest, idx);
      changed = true;
    } else {
      const curr = result[existIdx];
      const incTs = Number(inc.updatedAt) || 0;
      const currTs = Number(curr.updatedAt) || 0;
      const maxRevokedAt =
        Math.max(Number(curr.sessionRevokedAt) || 0, Number(inc.sessionRevokedAt) || 0) ||
        undefined;
      const protectAdmin = isProtectedAdmin || isBootstrappedAdminUser(curr);

      if (incTs > currTs) {
        const mergedEmailVal = protectAdmin
          ? BOOTSTRAPPED_ADMIN_EMAIL
          : inc.email
            ? inc.email
            : curr.email;
        const mergedEmailDigest = protectAdmin
          ? BOOTSTRAPPED_ADMIN_DIGEST
          : computeEmailAuthDigest(mergedEmailVal) || inc.emailDigest || curr.emailDigest || undefined;
        const nextUser: User = {
          ...curr,
          ...inc,
          id: curr.id || inc.id,
          username: curr.username || inc.username,
          role: protectAdmin ? 'admin' : inc.role || curr.role,
          isActive: protectAdmin ? true : inc.isActive,
          email: mergedEmailVal,
          emailDigest: mergedEmailDigest,
          phone: inc.phone !== undefined && inc.phone !== '' ? inc.phone : curr.phone,
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
          nextUser.emailDigest !== curr.emailDigest ||
          nextUser.department !== curr.department ||
          nextUser.sessionRevokedAt !== curr.sessionRevokedAt ||
          nextUser.updatedAt !== curr.updatedAt
        ) {
          result[existIdx] = nextUser;
          if (nextUser.emailDigest) indexByEmailDigest.set(nextUser.emailDigest, existIdx);
          changed = true;
        }
      } else {
        // Chỉ bổ sung thông tin còn thiếu và mốc thu hồi phiên lớn hơn, không ghi đè lùi
        const mergedFullName = curr.fullName || inc.fullName;
        const mergedEmail = protectAdmin ? BOOTSTRAPPED_ADMIN_EMAIL : curr.email || inc.email;
        const mergedEmailDigest = protectAdmin
          ? BOOTSTRAPPED_ADMIN_DIGEST
          : computeEmailAuthDigest(mergedEmail) || curr.emailDigest || inc.emailDigest || undefined;
        const mergedPhone = curr.phone || inc.phone;
        const mergedDept = curr.department || inc.department;
        const mergedPass = curr.password || inc.password;
        const mergedRole = protectAdmin ? 'admin' : curr.role;
        const mergedActive = protectAdmin ? true : curr.isActive;
        if (
          mergedFullName !== curr.fullName ||
          mergedEmail !== curr.email ||
          mergedEmailDigest !== curr.emailDigest ||
          mergedPhone !== curr.phone ||
          mergedDept !== curr.department ||
          mergedPass !== curr.password ||
          mergedRole !== curr.role ||
          mergedActive !== curr.isActive ||
          maxRevokedAt !== curr.sessionRevokedAt
        ) {
          result[existIdx] = {
            ...curr,
            fullName: mergedFullName,
            role: mergedRole,
            isActive: mergedActive,
            email: mergedEmail,
            emailDigest: mergedEmailDigest,
            phone: mergedPhone,
            department: mergedDept,
            password: mergedPass,
            sessionRevokedAt: maxRevokedAt
          };
          if (mergedEmailDigest) indexByEmailDigest.set(mergedEmailDigest, existIdx);
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

// ============================================================================
// 6. ĐỒNG BỘ TỰ ĐỘNG DANH MỤC VẬT TƯ TỪ PHIẾU NHẬP & PHIẾU XUẤT (LẤY MỚI NHẤT)
// ============================================================================
export interface SyncedMaterialCandidate {
  code: string;
  name: string;
  unit: string;
  category: string;
  hasSpecificCategory: boolean;
  packageNo: string;
  drawingNo: string;
  manufacturer: string;
  supplier: string;
  unitWeightKg: number;
  specification: string;
  latestItemNote: string;
  latestSourceNote: string;
  latestMutationTs: number;
  latestPrimaryTs: number;
}

function parseVoucherDateToMs(rawDate?: string | null): number {
  const s = (rawDate || '').trim();
  if (!s) return 0;

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return Date.UTC(y, m - 1, d);
    }
  }

  // DD/MM/YYYY hoặc DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return Date.UTC(y, m - 1, d);
    }
  }

  const parsed = Date.parse(s);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanMaterialFieldVal(raw?: string | null): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (upper === 'N/A' || upper === 'NA' || upper === '-' || upper === '--' || upper === 'NULL' || upper === 'NONE') {
    return '';
  }
  return s;
}

function cleanHeaderSupplierFallback(raw?: string | null): string {
  const s = cleanMaterialFieldVal(raw);
  if (!s) return '';
  const lower = s.toLowerCase();
  if (
    lower === 'nhiều nhà cung cấp' ||
    lower === 'đơn vị giao hàng' ||
    lower === 'theo phiếu nhập'
  ) {
    return '';
  }
  return s;
}

function isGenericMaterialCategory(cat: string): boolean {
  const lower = cat.trim().toLowerCase();
  return !lower || lower === 'chung' || lower === 'vật tư dự án' || lower === 'khác';
}

export function deriveCatalogMaterialCode(rawCode?: string | null, rawName?: string | null): string {
  const cleanCode = cleanMaterialFieldVal(rawCode);
  if (cleanCode) {
    return normKey(cleanCode);
  }
  const cleanName = cleanMaterialFieldVal(rawName);
  if (!cleanName) return '';

  const asciiSlug = cleanName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10);

  const [h1] = hashPair(`AUTO_MAT_CODE|${cleanName.toLowerCase()}`);
  const suffix = h1.toString(36).toUpperCase().slice(0, 4);
  return `VT-${asciiSlug || 'ITEM'}-${suffix}`;
}

interface OrderedReceiptRef {
  kind: 'inbound' | 'outbound';
  primaryTs: number;
  mutationTs: number;
  sourceOrder: number;
  voucherCode: string;
  inbound?: InboundReceipt;
  outbound?: OutboundReceipt;
}

export function buildLatestMaterialsFromReceipts(
  inbounds: InboundReceipt[],
  outbounds: OutboundReceipt[]
): Map<string, SyncedMaterialCandidate> {
  const refs: OrderedReceiptRef[] = [];

  for (let i = 0; i < inbounds.length; i++) {
    const r = inbounds[i];
    if (!r || !Array.isArray(r.items) || r.items.length === 0) continue;
    const dateMs = parseVoucherDateToMs(r.receiptDate);
    const editedTs = Math.max(
      Number(r.itemsReplacedAt) || 0,
      r.lastEditedAt ? Date.parse(r.lastEditedAt) || 0 : 0
    );
    const createdTs = r.createdAt ? Date.parse(r.createdAt) || 0 : 0;
    const mutationTs = Math.max(Number(r.updatedAt) || 0, editedTs, createdTs, 1);
    const primaryTs = Math.max(dateMs, editedTs);
    refs.push({
      kind: 'inbound',
      primaryTs,
      mutationTs,
      sourceOrder: 0,
      voucherCode: normKey(r.receiptCode || r.id),
      inbound: r
    });
  }

  for (let i = 0; i < outbounds.length; i++) {
    const o = outbounds[i];
    if (!o || !Array.isArray(o.items) || o.items.length === 0) continue;
    const dateMs = parseVoucherDateToMs(o.issueDate);
    const editedTs = Math.max(
      Number(o.itemsReplacedAt) || 0,
      o.lastEditedAt ? Date.parse(o.lastEditedAt) || 0 : 0
    );
    const createdTs = o.createdAt ? Date.parse(o.createdAt) || 0 : 0;
    const mutationTs = Math.max(Number(o.updatedAt) || 0, editedTs, createdTs, 1);
    const primaryTs = Math.max(dateMs, editedTs);
    refs.push({
      kind: 'outbound',
      primaryTs,
      mutationTs,
      sourceOrder: 1,
      voucherCode: normKey(o.issueCode || o.id),
      outbound: o
    });
  }

  // Sắp xếp từ cũ -> mới để bản ghi sau cùng luôn ghi đè bằng dữ liệu mới nhất
  refs.sort((a, b) => {
    if (a.primaryTs !== b.primaryTs) return a.primaryTs - b.primaryTs;
    if (a.mutationTs !== b.mutationTs) return a.mutationTs - b.mutationTs;
    if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    return a.voucherCode.localeCompare(b.voucherCode, undefined, { numeric: true });
  });

  const map = new Map<string, SyncedMaterialCandidate>();

  for (let rIdx = 0; rIdx < refs.length; rIdx++) {
    const ref = refs[rIdx];
    if (ref.kind === 'inbound' && ref.inbound) {
      const rcp = ref.inbound;
      const fallbackMaker = cleanMaterialFieldVal(rcp.manufacturer);
      const fallbackSupplier = cleanHeaderSupplierFallback(rcp.supplier);
      const sourceNote = `Đồng bộ từ phiếu nhập ${rcp.receiptCode}`;
      const items = rcp.items;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const code = deriveCatalogMaterialCode(it.materialCode, it.materialName);
        if (!code) continue;

        const name = cleanMaterialFieldVal(it.materialName);
        const unit = cleanMaterialFieldVal(it.unit);
        const cat = cleanMaterialFieldVal(it.category);
        const specificCat = Boolean(cat && !isGenericMaterialCategory(cat));
        const pkgNo = cleanMaterialFieldVal(it.packageNo);
        const dwgNo = cleanMaterialFieldVal(it.drawingNo);
        const maker = cleanMaterialFieldVal(it.manufacturer) || fallbackMaker;
        const supplier = cleanMaterialFieldVal(it.supplier) || fallbackSupplier;
        const qty = roundQty(it.quantity);
        const weight = Number(it.weightKg) || 0;
        const calcUnitWeight = qty > 0 && weight > 0 ? Math.round((weight / qty) * 100) / 100 : 0;
        const spec = cleanMaterialFieldVal(it.conditionNote);
        const itemNote = cleanMaterialFieldVal(it.note);

        const prev = map.get(code);
        if (!prev) {
          map.set(code, {
            code,
            name: name || code,
            unit: unit || 'Bộ',
            category: cat || 'Chung',
            hasSpecificCategory: specificCat,
            packageNo: pkgNo,
            drawingNo: dwgNo,
            manufacturer: maker,
            supplier,
            unitWeightKg: calcUnitWeight,
            specification: spec,
            latestItemNote: itemNote,
            latestSourceNote: sourceNote,
            latestMutationTs: ref.mutationTs,
            latestPrimaryTs: ref.primaryTs
          });
        } else {
          if (name) prev.name = name;
          if (unit) prev.unit = unit;
          if (specificCat) {
            prev.category = cat;
            prev.hasSpecificCategory = true;
          } else if (cat && !prev.hasSpecificCategory) {
            prev.category = cat;
          }
          if (pkgNo) prev.packageNo = pkgNo;
          if (dwgNo) prev.drawingNo = dwgNo;
          if (maker) prev.manufacturer = maker;
          if (supplier) prev.supplier = supplier;
          if (calcUnitWeight > 0) prev.unitWeightKg = calcUnitWeight;
          if (spec) prev.specification = spec;
          if (itemNote) prev.latestItemNote = itemNote;
          prev.latestSourceNote = sourceNote;
          if (ref.mutationTs > prev.latestMutationTs) prev.latestMutationTs = ref.mutationTs;
          if (ref.primaryTs > prev.latestPrimaryTs) prev.latestPrimaryTs = ref.primaryTs;
        }
      }
    } else if (ref.kind === 'outbound' && ref.outbound) {
      const rcp = ref.outbound;
      const sourceNote = `Đồng bộ từ phiếu xuất ${rcp.issueCode}`;
      const items = rcp.items;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const code = deriveCatalogMaterialCode(it.materialCode, it.materialName);
        if (!code) continue;

        const name = cleanMaterialFieldVal(it.materialName);
        const unit = cleanMaterialFieldVal(it.unit);
        const cat = cleanMaterialFieldVal(it.category);
        const specificCat = Boolean(cat && !isGenericMaterialCategory(cat));
        const pkgNo = cleanMaterialFieldVal(it.packageNo);
        const dwgNo = cleanMaterialFieldVal(it.drawingNo);
        const maker = cleanMaterialFieldVal(it.manufacturer);
        const supplier = cleanMaterialFieldVal(it.supplier);
        const qty = roundQty(it.quantity);
        const weight = Number(it.weightKg) || 0;
        const calcUnitWeight = qty > 0 && weight > 0 ? Math.round((weight / qty) * 100) / 100 : 0;
        const itemNote = cleanMaterialFieldVal(it.note);

        const prev = map.get(code);
        if (!prev) {
          map.set(code, {
            code,
            name: name || code,
            unit: unit || 'Bộ',
            category: cat || 'Chung',
            hasSpecificCategory: specificCat,
            packageNo: pkgNo,
            drawingNo: dwgNo,
            manufacturer: maker,
            supplier,
            unitWeightKg: calcUnitWeight,
            specification: '',
            latestItemNote: itemNote,
            latestSourceNote: sourceNote,
            latestMutationTs: ref.mutationTs,
            latestPrimaryTs: ref.primaryTs
          });
        } else {
          if (name) prev.name = name;
          if (unit) prev.unit = unit;
          if (specificCat) {
            prev.category = cat;
            prev.hasSpecificCategory = true;
          } else if (cat && !prev.hasSpecificCategory) {
            prev.category = cat;
          }
          if (pkgNo) prev.packageNo = pkgNo;
          if (dwgNo) prev.drawingNo = dwgNo;
          if (maker) prev.manufacturer = maker;
          if (supplier) prev.supplier = supplier;
          if (calcUnitWeight > 0) prev.unitWeightKg = calcUnitWeight;
          if (itemNote) prev.latestItemNote = itemNote;
          prev.latestSourceNote = sourceNote;
          if (ref.mutationTs > prev.latestMutationTs) prev.latestMutationTs = ref.mutationTs;
          if (ref.primaryTs > prev.latestPrimaryTs) prev.latestPrimaryTs = ref.primaryTs;
        }
      }
    }
  }

  return map;
}

// ============================================================================
// Smart Sequential Voucher Numbering (PNK / PXK Auto-Increment)
// ============================================================================

export interface VoucherCodeSeed {
  code: string;
  date?: string;
  createdAt?: string;
  lastEditedAt?: string;
  updatedAt?: number;
  isExcelFallbackCandidate?: boolean;
}

interface ParsedVoucherCode {
  mode: 'trailing' | 'leading';
  affix: string;
  affixKey: string;
  num: number;
  padLen: number;
  prefixYear: number;
  createdTs: number;
  voucherDateKey: string;
  index: number;
  isExcelFallback: boolean;
}

function extractVoucherPrefixYear(affix: string): number {
  const m = /^(?:PNK|PXK|NK|XK)[-_/\s.]?(\d{2}|\d{4})[-_/\s.]$/i.exec(affix.trim());
  if (!m) return 0;
  const rawYear = parseInt(m[1], 10);
  if (isNaN(rawYear)) return 0;
  if (m[1].length === 2) {
    return rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear;
  }
  return rawYear;
}

function normalizeIsoDateForSort(rawDate: string | undefined): string {
  const s = (rawDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
}

function parseSingleVoucherCode(
  seed: VoucherCodeSeed,
  index: number
): ParsedVoucherCode | null {
  const raw = (seed.code || '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  // Bỏ qua các mã phiếu lấy theo Packing List (VD: PNK-PL-01, PXK-PL...) hoặc định dạng ngày YYYY-MM-DD
  if (
    upper.startsWith('PNK-PL') ||
    upper.startsWith('PXK-PL') ||
    upper.startsWith('PL-') ||
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)
  ) {
    return null;
  }

  const createdTs = Date.parse(seed.createdAt || '') || 0;
  const voucherDateKey = normalizeIsoDateForSort(seed.date);
  const isExcelFallback = Boolean(seed.isExcelFallbackCandidate);

  // Dạng 1 (phổ biến nhất): Tiền tố + Số thứ tự ở cuối (VD: PNK25-0019, PNK26-0001, PXK25-0005, PNK-012)
  const trailingMatch = /^(.*?)(\d{1,8})$/.exec(raw);
  if (trailingMatch && trailingMatch[1].trim().length > 0) {
    const rawPrefix = trailingMatch[1].toUpperCase();
    const digits = trailingMatch[2];
    const num = parseInt(digits, 10);
    if (!isNaN(num) && num >= 0) {
      return {
        mode: 'trailing',
        affix: rawPrefix,
        affixKey: `T:${rawPrefix}`,
        num,
        padLen: digits.length,
        prefixYear: extractVoucherPrefixYear(rawPrefix),
        createdTs,
        voucherDateKey,
        index,
        isExcelFallback
      };
    }
  }

  // Dạng 2: Số thứ tự ở đầu + Hậu tố (VD: 0019/PNK, 005/PXK-2026)
  const leadingMatch = /^(\d{1,6})(\/[A-Za-z0-9_.-]+)$/.exec(raw);
  if (leadingMatch) {
    const digits = leadingMatch[1];
    const rawSuffix = leadingMatch[2].toUpperCase();
    const num = parseInt(digits, 10);
    if (!isNaN(num) && num >= 0) {
      return {
        mode: 'leading',
        affix: rawSuffix,
        affixKey: `L:${rawSuffix}`,
        num,
        padLen: digits.length,
        prefixYear: 0,
        createdTs,
        voucherDateKey,
        index,
        isExcelFallback
      };
    }
  }

  return null;
}

export function generateNextSequentialVoucherCode(
  seeds: VoucherCodeSeed[],
  defaultType: 'PNK' | 'PXK',
  fallbackDateStr?: string
): string {
  const occupiedCodes = new Set<string>();
  const allParsed: ParsedVoucherCode[] = [];

  for (let i = 0; i < seeds.length; i++) {
    const k = normKey(seeds[i].code);
    if (k) occupiedCodes.add(k);
    const parsed = parseSingleVoucherCode(seeds[i], i);
    if (parsed) {
      allParsed.push(parsed);
    }
  }

  // Loại trừ các mã ngẫu nhiên 4 chữ số cũ do import Excel tự sinh (nếu có) để không làm nhảy vọt số thứ tự
  const nonFallbackParsed = allParsed.filter((p) => !p.isExcelFallback);
  const candidates = nonFallbackParsed;

  if (candidates.length === 0) {
    const normDate = normalizeIsoDateForSort(fallbackDateStr);
    const yy = normDate
      ? normDate.slice(2, 4)
      : String(new Date().getFullYear()).slice(-2);
    const prefix = `${defaultType}${yy}-`;
    let seq = 1;
    let candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    while (occupiedCodes.has(normKey(candidate))) {
      seq++;
      candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    }
    return candidate;
  }

  // Gom nhóm theo bộ tiền tố/hậu tố (series) và chọn bộ số đang được sử dụng gần nhất
  interface SeriesStats {
    mode: 'trailing' | 'leading';
    affix: string;
    maxSeq: number;
    padLen: number;
    latestCreatedTs: number;
    prefixYear: number;
    latestVoucherDate: string;
    minIndex: number;
  }

  const seriesMap = new Map<string, SeriesStats>();
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const existing = seriesMap.get(c.affixKey);
    if (!existing) {
      seriesMap.set(c.affixKey, {
        mode: c.mode,
        affix: c.affix,
        maxSeq: c.num,
        padLen: c.padLen,
        latestCreatedTs: c.createdTs,
        prefixYear: c.prefixYear,
        latestVoucherDate: c.voucherDateKey,
        minIndex: c.index
      });
    } else {
      if (c.num > existing.maxSeq) {
        existing.maxSeq = c.num;
      }
      if (c.padLen > existing.padLen) {
        existing.padLen = c.padLen;
      }
      if (c.createdTs > existing.latestCreatedTs) {
        existing.latestCreatedTs = c.createdTs;
      }
      if (c.voucherDateKey > existing.latestVoucherDate) {
        existing.latestVoucherDate = c.voucherDateKey;
      }
      if (c.index < existing.minIndex) {
        existing.minIndex = c.index;
      }
    }
  }

  let chosenSeries: SeriesStats | null = null;
  seriesMap.forEach((stats) => {
    if (!chosenSeries) {
      chosenSeries = stats;
      return;
    }
    if (stats.latestCreatedTs !== chosenSeries.latestCreatedTs) {
      if (stats.latestCreatedTs > chosenSeries.latestCreatedTs) chosenSeries = stats;
      return;
    }
    if (stats.prefixYear !== chosenSeries.prefixYear) {
      if (stats.prefixYear > chosenSeries.prefixYear) chosenSeries = stats;
      return;
    }
    if (stats.latestVoucherDate !== chosenSeries.latestVoucherDate) {
      if (stats.latestVoucherDate > chosenSeries.latestVoucherDate) chosenSeries = stats;
      return;
    }
    if (stats.minIndex < chosenSeries.minIndex) {
      chosenSeries = stats;
    }
  });

  const active = chosenSeries!;
  const targetPad = Math.max(active.padLen, 1);
  let nextSeq = active.maxSeq + 1;
  const formatCandidate = (n: number) => {
    const numStr = String(n).padStart(targetPad, '0');
    return active.mode === 'trailing' ? `${active.affix}${numStr}` : `${numStr}${active.affix}`;
  };

  let nextCode = formatCandidate(nextSeq);
  while (occupiedCodes.has(normKey(nextCode))) {
    nextSeq++;
    nextCode = formatCandidate(nextSeq);
  }
  return nextCode;
}

export function generateNextInboundVoucherCode(
  receipts: InboundReceipt[],
  fallbackDateStr?: string
): string {
  // Kiểm tra các số xuất hiện để nhận diện mã ngẫu nhiên cũ từ Excel (PL-EXCEL + SHP-EXCEL + 4 chữ số ngẫu nhiên >= 1000)
  const numSet = new Set<number>();
  for (let i = 0; i < receipts.length; i++) {
    const m = /^PNK\d{2}-(\d+)$/i.exec((receipts[i].receiptCode || '').trim());
    if (m) numSet.add(parseInt(m[1], 10));
  }

  const seeds: VoucherCodeSeed[] = receipts.map((r) => {
    const rawCode = (r.receiptCode || '').trim();
    const m = /^PNK\d{2}-([1-9]\d{3})$/i.exec(rawCode);
    const num = m ? parseInt(m[1], 10) : 0;
    const isIsolatedRandomExcel =
      Boolean(m) &&
      r.packingListNo === 'PL-EXCEL' &&
      r.shipment === 'SHP-EXCEL' &&
      !numSet.has(num - 1) &&
      !numSet.has(1);

    return {
      code: rawCode,
      date: r.receiptDate,
      createdAt: r.createdAt,
      lastEditedAt: r.lastEditedAt,
      updatedAt: r.updatedAt,
      isExcelFallbackCandidate: isIsolatedRandomExcel
    };
  });

  return generateNextSequentialVoucherCode(seeds, 'PNK', fallbackDateStr);
}

export function generateNextOutboundVoucherCode(
  receipts: OutboundReceipt[],
  fallbackDateStr?: string
): string {
  const numSet = new Set<number>();
  for (let i = 0; i < receipts.length; i++) {
    const m = /^PXK\d{2}-(\d+)$/i.exec((receipts[i].issueCode || '').trim());
    if (m) numSet.add(parseInt(m[1], 10));
  }

  const seeds: VoucherCodeSeed[] = receipts.map((r) => {
    const rawCode = (r.issueCode || '').trim();
    const m = /^PXK\d{2}-([1-9]\d{3})$/i.exec(rawCode);
    const num = m ? parseInt(m[1], 10) : 0;
    const firstItem = r.items?.[0];
    const isIsolatedRandomExcel =
      Boolean(m) &&
      firstItem?.packingListNo === 'PL-EXCEL-01' &&
      firstItem?.shipment === 'SHP-EXCEL' &&
      !numSet.has(num - 1) &&
      !numSet.has(1);

    return {
      code: rawCode,
      date: r.issueDate,
      createdAt: r.createdAt,
      lastEditedAt: r.lastEditedAt,
      updatedAt: r.updatedAt,
      isExcelFallbackCandidate: isIsolatedRandomExcel
    };
  });

  return generateNextSequentialVoucherCode(seeds, 'PXK', fallbackDateStr);
}

