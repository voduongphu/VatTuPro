import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  type DocumentReference,
  type Unsubscribe
} from 'firebase/firestore';
import {
  db,
  auth,
  signInWithGooglePopup,
  signOutAndPurgeFirebaseAuth,
  signOut,
  onAuthStateChanged,
  handleFirestoreError,
  onFirestoreQuotaError,
  isFirestoreCircuitOpen,
  markFirestoreTemporarilyUnavailable,
  OperationType,
  type FirebaseUser
} from './firebase';
import { StorageService } from './storage';
import type {
  User,
  Warehouse,
  MaterialItem,
  InboundReceipt,
  InboundItemDetail,
  OutboundReceipt,
  OutboundItemDetail,
  TombstoneMap,
  ActiveUserSession,
  OsdReceipt,
  OsdItemDetail,
  OsdPdfAttachment
} from '../types/inventory';
import {
  normKey,
  normUserKey,
  computeEmailAuthDigest,
  resolveGoogleUserRecord,
  findMatchingUser,
  isPasswordMatch,
  isSessionHeartbeatFresh,
  createEmptyTombstones,
  isRecordDeleted,
  computeMaterialsDigest,
  computeInboundReceiptDigest,
  computeOutboundReceiptDigest,
  computePackingListSummary,
  sumInboundItems,
  sumOutboundItems,
  roundQty,
  canonicalUserSessionKey,
  computeOsdDigest
} from '../utils/additiveMerge';

export type CloudConnectionStatus =
  | 'initializing'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface CloudSyncSnapshotState {
  authReady: boolean;
  status: CloudConnectionStatus;
  cloudEmail: string | null;
  cloudDisplayName: string | null;
  cloudUid: string | null;
  lastSyncedAt: number | null;
  errorMessage: string | null;
}

interface CloudReceiptIndexEntry {
  docId: string;
  code: string;
  id: string;
  itemCount: number;
  chunkCount: number;
  appUpdatedAt: number;
  itemsReplacedAt: number;
  digest: string;
}

interface WorkspaceManifestDoc {
  workspaceId: string;
  name: string;
  ownerUid: string;
  updatedByUid: string;
  status: 'active' | 'archived';
  allowSelfJoin: boolean;
  serverRevision: number;
  metaRevision: number;
  materialsRevision: number;
  materialsCount: number;
  materialsChunkCount: number;
  materialsDigest: string;
  metaDigest: string;
  accountChunkCount: number;
  warehouseChunkCount: number;
  tombstoneChunkCount: number;
  inboundIndexChunkCount: number;
  outboundIndexChunkCount: number;
}

const WORKSPACE_ID = 'vtp_main';
const WORKSPACE_NAME = 'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư';
const BOOTSTRAPPED_ADMIN_EMAIL = 'voduongphu@gmail.com';
const CLOUD_CHUNK_SIZE = 200;
const BATCH_OP_LIMIT = 380;
const ACTIVE_SESSION_TTL_MS = 90_000;

const knownExistingPaths = new Set<string>();
const stateListeners = new Set<(state: CloudSyncSnapshotState) => void>();

let currentState: CloudSyncSnapshotState = {
  authReady: false,
  status: 'initializing',
  cloudEmail: null,
  cloudDisplayName: null,
  cloudUid: null,
  lastSyncedAt: null,
  errorMessage: null
};

let workspaceUnsub: Unsubscribe | null = null;
let sessionUnsub: Unsubscribe | null = null;
let osdUnsub: Unsubscribe | null = null;
let watchedSessionDocId: string | null = null;
let workspaceReadyPromise: Promise<boolean> | null = null;
let workspaceReadyUid: string | null = null;
let verifiedWorkspaceUid: string | null = null;
let cachedWsManifest: { data: WorkspaceManifestDoc; atMs: number } | null = null;
let interactiveAuthInFlight = false;
let adminPiiLoadedForMetaRev = -1;
let lastAppliedCloudServerRev = -1;
let lastAppliedCloudMetaRev = -1;
let isCloudReconciling = false;
let pendingCloudReconcile = false;
let cloudMetaDirty = false;
let cloudMaterialsDirty = false;

let externalOnRemoteWorkspaceChange: (() => void) | null = null;
let externalOnRemoteSessionSnapshot: ((remoteData: Record<string, any>) => void) | null = null;
let externalOnRemoteOsdChange: ((remoteOsd: OsdReceipt[]) => void) | null = null;
let externalIsLocalSessionStillActive: ((sessionToken: string) => boolean) | null = null;

const revokedCloudSessionTokens = new Set<string>();
const authReadyWaiters = new Set<() => void>();

function rememberRevokedCloudToken(token?: string | null): void {
  const clean = String(token || '').trim();
  if (!clean) return;
  if (revokedCloudSessionTokens.size > 500) {
    const oldest = revokedCloudSessionTokens.values().next().value;
    if (oldest) revokedCloudSessionTokens.delete(oldest);
  }
  revokedCloudSessionTokens.add(clean);
}

function isSessionStillValidLocally(token?: string | null): boolean {
  const clean = String(token || '').trim();
  if (!clean) return false;
  if (revokedCloudSessionTokens.has(clean)) return false;
  if (externalIsLocalSessionStillActive && !externalIsLocalSessionStillActive(clean)) {
    return false;
  }
  return true;
}

async function ensureValidFirebaseAuthToken(fbUser: FirebaseUser): Promise<boolean> {
  try {
    await fbUser.getIdToken(false);
    return true;
  } catch (err: any) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    const isStaleOrRevoked =
      code === 'auth/user-token-expired' ||
      code === 'auth/invalid-user-token' ||
      code === 'auth/user-disabled' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      msg.includes('TOKEN_EXPIRED') ||
      msg.includes('USER_DISABLED') ||
      msg.includes('INVALID_REFRESH_TOKEN');
    if (isStaleOrRevoked) {
      try {
        detachAllListeners();
        workspaceReadyPromise = null;
        workspaceReadyUid = null;
        await signOut(auth);
        emitCloudState({
          status: 'disconnected',
          cloudEmail: null,
          cloudDisplayName: null,
          cloudUid: null,
          errorMessage: null
        });
      } catch {
        // ignore signOut cleanup error
      }
    }
    return false;
  }
}

function resolveAuthReadyWaiters(): void {
  if (authReadyWaiters.size === 0) return;
  authReadyWaiters.forEach((resolve) => {
    try {
      resolve();
    } catch {
      // ignore
    }
  });
  authReadyWaiters.clear();
}

function emitCloudState(patch: Partial<CloudSyncSnapshotState>): void {
  currentState = { ...currentState, ...patch };
  if (currentState.authReady) {
    resolveAuthReadyWaiters();
  }
  stateListeners.forEach((cb) => {
    try {
      cb(currentState);
    } catch {
      // ignore listener errors
    }
  });
}

onFirestoreQuotaError((msg) => {
  emitCloudState({ status: 'error', errorMessage: msg });
});

// ============================================================================
// Deterministic Hashing & Blueprint-Bound Sanitization Helpers
// ============================================================================
function hash32Pair(str: string): [number, number] {
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

export function makeSafeDocId(prefix: string, rawKey: string): string {
  const normalized = String(rawKey || 'default').trim();
  const [h1, h2] = hash32Pair(`${prefix}|${normalized}`);
  const asciiSlug = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 44);
  const hashHex = `${h1.toString(36)}${h2.toString(36)}`;
  const id = asciiSlug ? `${prefix}_${asciiSlug}_${hashHex}` : `${prefix}_${hashHex}`;
  return id.slice(0, 120);
}

function cleanStr(val: unknown, maxLen: number, minFallback = ''): string {
  const s = val === null || val === undefined ? '' : String(val).trim();
  if (!s && minFallback) return minFallback.slice(0, maxLen);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function cleanNum(val: unknown, min = 0, max = 100_000_000_000_000): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return Math.max(0, min);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function chunkArray<T>(arr: T[], size = CLOUD_CHUNK_SIZE): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isCloudAdmin(fbUser: FirebaseUser | null): boolean {
  return Boolean(
    fbUser &&
      fbUser.emailVerified &&
      fbUser.email &&
      fbUser.email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
}

// Digest chung không phụ thuộc PII tách riêng để Admin và Nhân viên kho luôn hội tụ 100%
function computeCloudSharedMetaDigest(
  users: User[],
  warehouses: Warehouse[],
  tombstones: TombstoneMap,
  osdListInput?: OsdReceipt[]
): string {
  let sum1 = 0;
  let sum2 = 0;
  let xor1 = 0;
  let tombCount = 0;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const emDigest = u.emailDigest || computeEmailAuthDigest(u.email) || '';
    const [h1, h2] = hash32Pair(
      `CU|${normUserKey(u.username)}|${u.id}|${u.fullName}|${u.role}|${u.password || ''}|${emDigest}|${u.isActive ? 1 : 0}|${u.department || ''}|${Number(u.updatedAt) || 0}|${Number(u.sessionRevokedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h1) >>> 0;
  }

  for (let i = 0; i < warehouses.length; i++) {
    const w = warehouses[i];
    const [h1, h2] = hash32Pair(
      `CW|${normKey(w.code)}|${w.id}|${w.name}|${w.location || ''}|${w.type}|${w.capacityAreaM2 || 0}|${w.capacityTons || 0}|${w.keeperName || ''}|${w.status}|${w.notes || ''}|${Number(w.updatedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h2) >>> 0;
  }

  const osdList = Array.isArray(osdListInput) ? osdListInput : StorageService.getOsdReceipts();
  for (let i = 0; i < osdList.length; i++) {
    const o = osdList[i];
    const [h1, h2] = hash32Pair(
      `COSD|${normKey(o.osdCode || o.id)}|${o.osdDate || ''}|${o.inboundReceiptCode || ''}|${o.status || ''}|${o.resolvedBy || ''}|${Number(o.totalOsdQuantity) || 0}|${o.items?.length || 0}|${Number(o.updatedAt) || 0}`
    );
    sum1 = (sum1 + h1) >>> 0;
    sum2 = (sum2 + h2) >>> 0;
    xor1 = (xor1 ^ h1) >>> 0;
  }

  const buckets: Array<keyof TombstoneMap> = ['inbound', 'outbound', 'materials', 'warehouses', 'users', 'osd'];
  for (let b = 0; b < buckets.length; b++) {
    const bucketName = buckets[b];
    const map = tombstones[bucketName] || {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const ts = Number(map[k]) || 0;
      if (ts <= 0) continue;
      tombCount++;
      const [h1, h2] = hash32Pair(`CT|${bucketName}|${k}|${ts}`);
      sum1 = (sum1 + h1) >>> 0;
      sum2 = (sum2 + h2) >>> 0;
      xor1 = (xor1 ^ (h1 ^ h2)) >>> 0;
    }
  }

  return `${users.length}.${warehouses.length}.${osdList.length}.${tombCount}:${sum1.toString(36)}:${sum2.toString(36)}:${xor1.toString(36)}`;
}

// ============================================================================
// Firestore Safe Document Read / Write Wrappers (Preserving Immortal createdAt)
// ============================================================================
function isPermissionError(err: unknown): boolean {
  const code = (err as any)?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'permission-denied' ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('PERMISSION_DENIED')
  );
}

async function safeGetDoc(ref: DocumentReference, pathLabel: string) {
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      knownExistingPaths.add(ref.path);
    } else {
      knownExistingPaths.delete(ref.path);
    }
    return snap;
  } catch (err) {
    const code = String((err as any)?.code || '');
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'resource-exhausted' || msg.includes('Quota exceeded')) {
      markFirestoreTemporarilyUnavailable(300_000);
    }
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.GET, pathLabel);
    }
    throw err;
  }
}

async function writeSingleProtectedDoc(
  ref: DocumentReference,
  pathLabel: string,
  immutableCreateFields: Record<string, any>,
  mutableFields: Record<string, any>
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Chưa kết nối tài khoản đám mây.');

  let existsAlready = knownExistingPaths.has(ref.path);
  if (!existsAlready) {
    const snap = await safeGetDoc(ref, pathLabel);
    existsAlready = snap.exists();
  }

  if (existsAlready) {
    try {
      await updateDoc(ref, {
        ...mutableFields,
        updatedByUid: uid,
        updatedAt: serverTimestamp()
      });
      return;
    } catch (err) {
      if (isPermissionError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, pathLabel);
      }
      throw err;
    }
  } else {
    try {
      await setDoc(ref, {
        ...immutableCreateFields,
        ...mutableFields,
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      knownExistingPaths.add(ref.path);
      return;
    } catch (err) {
      if (isPermissionError(err)) {
        handleFirestoreError(err, OperationType.CREATE, pathLabel);
      }
      throw err;
    }
  }
}

interface StagedDocWrite {
  ref: DocumentReference;
  pathLabel: string;
  immutableCreateFields: Record<string, any>;
  mutableFields: Record<string, any>;
}

async function commitStagedWrites(writes: StagedDocWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Chưa kết nối tài khoản đám mây.');

  // Kiểm tra sự tồn tại trước cho các doc chưa biết trạng thái để chọn đúng set (create) hay update
  const unknownWrites = writes.filter((w) => !knownExistingPaths.has(w.ref.path));
  for (let i = 0; i < unknownWrites.length; i += 25) {
    const slice = unknownWrites.slice(i, i + 25);
    await Promise.all(slice.map((w) => safeGetDoc(w.ref, w.pathLabel)));
  }

  for (let start = 0; start < writes.length; start += BATCH_OP_LIMIT) {
    const chunk = writes.slice(start, start + BATCH_OP_LIMIT);
    const batch = writeBatch(db);
    for (let i = 0; i < chunk.length; i++) {
      const w = chunk[i];
      if (knownExistingPaths.has(w.ref.path)) {
        batch.update(w.ref, {
          ...w.mutableFields,
          updatedByUid: uid,
          updatedAt: serverTimestamp()
        });
      } else {
        batch.set(w.ref, {
          ...w.immutableCreateFields,
          ...w.mutableFields,
          updatedByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    try {
      await batch.commit();
      for (let i = 0; i < chunk.length; i++) {
        knownExistingPaths.add(chunk[i].ref.path);
      }
    } catch (err) {
      if (isPermissionError(err)) {
        handleFirestoreError(err, OperationType.WRITE, chunk[0]?.pathLabel || `workspaces/${WORKSPACE_ID}`);
      }
      throw err;
    }
  }
}

// ============================================================================
// Entity Serializers & Deserializers (Native Maps Only, Zero JSON.stringify)
// ============================================================================
function serializeAccountPublic(u: User): Record<string, any> {
  const emailDigest = cleanStr(u.emailDigest || computeEmailAuthDigest(u.email), 64, '');
  return {
    id: cleanStr(u.id, 120, `user-${Date.now()}`),
    username: cleanStr(u.username, 120, 'user'),
    fullName: cleanStr(u.fullName || u.username, 160, 'Người dùng'),
    role: ['admin', 'manager', 'staff', 'viewer'].includes(u.role) ? u.role : 'staff',
    credential: cleanStr(u.password, 120, ''),
    emailDigest,
    department: cleanStr(u.department, 160, ''),
    isActive: Boolean(u.isActive),
    createdAt: cleanStr(u.createdAt, 64, new Date().toISOString()),
    lastLogin: cleanStr(u.lastLogin, 64, ''),
    sessionRevokedAt: cleanNum(u.sessionRevokedAt, 0),
    updatedAt: cleanNum(u.updatedAt, 1)
  };
}

function deserializeAccountPublic(m: Record<string, any>): User {
  const emailDigest = cleanStr(m.emailDigest, 64, '');
  return {
    id: cleanStr(m.id, 120, 'user-unknown'),
    username: cleanStr(m.username, 120, 'user'),
    fullName: cleanStr(m.fullName, 160, cleanStr(m.username, 120, 'Người dùng')),
    role: ['admin', 'manager', 'staff', 'viewer'].includes(m.role) ? m.role : 'staff',
    password: cleanStr(m.credential, 120, ''),
    emailDigest: emailDigest || undefined,
    department: cleanStr(m.department, 160, ''),
    isActive: m.isActive !== false,
    createdAt: cleanStr(m.createdAt, 64, '2026-01-01T00:00:00Z'),
    lastLogin: cleanStr(m.lastLogin, 64, '') || undefined,
    sessionRevokedAt: Number(m.sessionRevokedAt) > 0 ? Number(m.sessionRevokedAt) : undefined,
    updatedAt: Number(m.updatedAt) || 1
  };
}

function serializeWarehousePublic(w: Warehouse): Record<string, any> {
  return {
    id: cleanStr(w.id, 120, `wh-${Date.now()}`),
    code: cleanStr(w.code, 100, 'WH'),
    name: cleanStr(w.name, 200, 'Kho vật tư'),
    location: cleanStr(w.location, 300, ''),
    type: ['covered', 'open_yard', 'transit', 'specialized'].includes(w.type) ? w.type : 'covered',
    capacityAreaM2: cleanNum(w.capacityAreaM2, 0),
    capacityTons: cleanNum(w.capacityTons, 0),
    keeperName: cleanStr(w.keeperName, 160, ''),
    status: ['active', 'full', 'maintenance'].includes(w.status) ? w.status : 'active',
    notes: cleanStr(w.notes, 500, ''),
    createdAt: cleanStr(w.createdAt, 64, new Date().toISOString()),
    updatedAt: cleanNum(w.updatedAt, 1)
  };
}

function deserializeWarehousePublic(m: Record<string, any>): Warehouse {
  return {
    id: cleanStr(m.id, 120, 'wh-0'),
    code: cleanStr(m.code, 100, 'WH'),
    name: cleanStr(m.name, 200, 'Kho vật tư'),
    location: cleanStr(m.location, 300, ''),
    type: ['covered', 'open_yard', 'transit', 'specialized'].includes(m.type) ? m.type : 'covered',
    capacityAreaM2: cleanNum(m.capacityAreaM2, 0),
    capacityTons: cleanNum(m.capacityTons, 0),
    keeperName: cleanStr(m.keeperName, 160, ''),
    phone: '',
    status: ['active', 'full', 'maintenance'].includes(m.status) ? m.status : 'active',
    notes: cleanStr(m.notes, 500, ''),
    createdAt: cleanStr(m.createdAt, 64, '2026-01-01T00:00:00Z'),
    updatedAt: Number(m.updatedAt) || 1
  };
}

function serializeOsdPublic(o: OsdReceipt): Record<string, any> {
  const safeItems = (Array.isArray(o.items) ? o.items : []).map((it) => ({
    id: cleanStr(it.id, 160),
    materialCode: cleanStr(it.materialCode, 160),
    materialName: cleanStr(it.materialName, 200),
    unit: cleanStr(it.unit, 64),
    packageNo: cleanStr(it.packageNo, 160),
    packageName: cleanStr(it.packageName, 200),
    packingListNo: cleanStr(it.packingListNo, 160),
    shipment: cleanStr(it.shipment, 160),
    inboundQuantity: cleanNum(it.inboundQuantity, 0),
    osdType: cleanStr(it.osdType, 32, 'damage'),
    osdQuantity: cleanNum(it.osdQuantity, 0),
    osdWeightKg: cleanNum(it.osdWeightKg, 0),
    defectDescription: cleanStr(it.defectDescription, 500),
    rootCause: cleanStr(it.rootCause, 500),
    proposedAction: cleanStr(it.proposedAction, 500)
  }));

  const payload: Record<string, any> = {
    id: cleanStr(o.id, 160, `osd-${Date.now()}`),
    osdCode: cleanStr(o.osdCode, 160, 'OSD-0001'),
    osdDate: cleanStr(o.osdDate, 32, new Date().toISOString().slice(0, 10)),
    inboundReceiptId: cleanStr(o.inboundReceiptId, 160),
    inboundReceiptCode: cleanStr(o.inboundReceiptCode, 160),
    warehouseId: cleanStr(o.warehouseId, 160),
    warehouseName: cleanStr(o.warehouseName, 200),
    supplier: cleanStr(o.supplier, 200),
    packingListNo: cleanStr(o.packingListNo, 160),
    shipment: cleanStr(o.shipment, 160),
    status: o.status === 'closed' ? 'closed' : 'open',
    resolutionNotes: cleanStr(o.resolutionNotes, 1000),
    resolvedAt: cleanStr(o.resolvedAt, 64),
    resolvedBy: cleanStr(o.resolvedBy, 160),
    items: safeItems,
    totalOsdQuantity: cleanNum(o.totalOsdQuantity, 0),
    totalOsdWeightKg: cleanNum(o.totalOsdWeightKg, 0),
    notes: cleanStr(o.notes, 1000),
    createdAt: cleanStr(o.createdAt, 64, new Date().toISOString()),
    createdBy: cleanStr(o.createdBy, 160),
    updatedAt: cleanNum(o.updatedAt, 1),
    lastEditedBy: cleanStr(o.lastEditedBy, 160),
    lastEditedAt: cleanStr(o.lastEditedAt, 64)
  };

  if (o.pdfAttachment) {
    const pdf = o.pdfAttachment;
    // Để tài liệu metaChunks/osd_0 không bao giờ vượt quá giới hạn 1MB của Firestore,
    // ta chỉ lưu metadata trong chunk danh sách, và dataUrl inline nếu kích thước nhỏ (< 50KB).
    // Toàn bộ file PDF đầy đủ được lưu và đồng bộ riêng biệt qua collection `osdAttachments`.
    const inlineDataUrl = (pdf.dataUrl || '').length < 65_000 ? pdf.dataUrl : '';
    payload.pdfAttachment = {
      fileName: cleanStr(pdf.fileName, 255),
      fileSize: cleanNum(pdf.fileSize, 0),
      fileType: cleanStr(pdf.fileType, 64, 'application/pdf'),
      uploadedAt: cleanStr(pdf.uploadedAt, 64),
      dataUrl: inlineDataUrl
    };
  }

  return payload;
}

function deserializeOsdPublic(raw: any): OsdReceipt {
  const safeItems: OsdItemDetail[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
    id: String(it?.id || ''),
    materialCode: String(it?.materialCode || ''),
    materialName: String(it?.materialName || ''),
    unit: String(it?.unit || 'Bộ'),
    packageNo: String(it?.packageNo || ''),
    packageName: String(it?.packageName || ''),
    packingListNo: String(it?.packingListNo || ''),
    shipment: String(it?.shipment || ''),
    inboundQuantity: Number(it?.inboundQuantity) || 0,
    osdType: (it?.osdType || 'damage') as any,
    osdQuantity: Number(it?.osdQuantity) || 0,
    osdWeightKg: it?.osdWeightKg ? Number(it.osdWeightKg) : undefined,
    defectDescription: String(it?.defectDescription || ''),
    rootCause: it?.rootCause ? String(it.rootCause) : undefined,
    proposedAction: it?.proposedAction ? String(it.proposedAction) : undefined
  }));

  const rcp: OsdReceipt = {
    id: String(raw?.id || `osd-${Date.now()}`),
    osdCode: String(raw?.osdCode || 'OSD-0001'),
    osdDate: String(raw?.osdDate || new Date().toISOString().slice(0, 10)),
    inboundReceiptId: String(raw?.inboundReceiptId || ''),
    inboundReceiptCode: String(raw?.inboundReceiptCode || ''),
    warehouseId: String(raw?.warehouseId || ''),
    warehouseName: String(raw?.warehouseName || ''),
    supplier: String(raw?.supplier || ''),
    packingListNo: raw?.packingListNo ? String(raw.packingListNo) : undefined,
    shipment: raw?.shipment ? String(raw.shipment) : undefined,
    status: raw?.status === 'closed' ? 'closed' : 'open',
    resolutionNotes: raw?.resolutionNotes ? String(raw.resolutionNotes) : undefined,
    resolvedAt: raw?.resolvedAt ? String(raw.resolvedAt) : undefined,
    resolvedBy: raw?.resolvedBy ? String(raw.resolvedBy) : undefined,
    items: safeItems,
    totalOsdQuantity: Number(raw?.totalOsdQuantity) || 0,
    totalOsdWeightKg: raw?.totalOsdWeightKg ? Number(raw.totalOsdWeightKg) : undefined,
    notes: raw?.notes ? String(raw.notes) : undefined,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    createdBy: String(raw?.createdBy || ''),
    updatedAt: Number(raw?.updatedAt) || 1,
    lastEditedBy: raw?.lastEditedBy ? String(raw.lastEditedBy) : undefined,
    lastEditedAt: raw?.lastEditedAt ? String(raw.lastEditedAt) : undefined
  };

  if (raw?.pdfAttachment && typeof raw.pdfAttachment === 'object') {
    rcp.pdfAttachment = {
      fileName: String(raw.pdfAttachment.fileName || 'bien_ban_osd.pdf'),
      fileSize: Number(raw.pdfAttachment.fileSize) || 0,
      fileType: String(raw.pdfAttachment.fileType || 'application/pdf'),
      uploadedAt: String(raw.pdfAttachment.uploadedAt || new Date().toISOString()),
      dataUrl: String(raw.pdfAttachment.dataUrl || '')
    };
  }

  return rcp;
}

async function pushSingleOsdAttachment(osdId: string, pdf: OsdPdfAttachment): Promise<void> {
  const dataUrl = pdf?.dataUrl;
  if (!osdId || !dataUrl || dataUrl.length === 0) return;
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  try {
    const CHUNK_CHAR_LIMIT = 600_000;
    const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_CHAR_LIMIT));
    const safeOsdId = makeSafeDocId('att', osdId);

    for (let c = 0; c < totalChunks; c++) {
      const chunkId = `${safeOsdId}_c${c}`;
      const chunkPath = `workspaces/${WORKSPACE_ID}/osdAttachments/${chunkId}`;
      const chunkRef = doc(db, 'workspaces', WORKSPACE_ID, 'osdAttachments', chunkId);
      const start = c * CHUNK_CHAR_LIMIT;
      const slice = dataUrl.slice(start, start + CHUNK_CHAR_LIMIT);

      await writeSingleProtectedDoc(
        chunkRef,
        chunkPath,
        {
          workspaceId: WORKSPACE_ID,
          attachmentId: chunkId,
          osdId: cleanStr(osdId, 160)
        },
        {
          chunkIndex: c,
          totalChunks,
          fileName: cleanStr(pdf.fileName, 255),
          fileSize: cleanNum(pdf.fileSize, 0),
          fileType: cleanStr(pdf.fileType, 64, 'application/pdf'),
          uploadedAt: cleanStr(pdf.uploadedAt, 64),
          dataChunk: slice
        }
      );
    }

    void fetch('/api/osd/attachment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ osdId, attachment: pdf })
    }).catch(() => {});
  } catch (err) {
    console.warn('pushSingleOsdAttachment deferred:', err);
  }
}

async function getOsdPdfAttachment(osdId: string): Promise<string | null> {
  if (!osdId) return null;

  const localList = StorageService.getOsdReceipts();
  const matched = localList.find((o) => o.id === osdId || normKey(o.osdCode) === normKey(osdId));
  if (matched?.pdfAttachment?.dataUrl && matched.pdfAttachment.dataUrl.length > 50) {
    return matched.pdfAttachment.dataUrl;
  }

  const fbUser = auth.currentUser;
  if (fbUser && fbUser.emailVerified && !isFirestoreCircuitOpen()) {
    try {
      const safeOsdId = makeSafeDocId('att', osdId);
      const c0Id = `${safeOsdId}_c0`;
      const c0Ref = doc(db, 'workspaces', WORKSPACE_ID, 'osdAttachments', c0Id);
      const c0Snap = await safeGetDoc(c0Ref, `workspaces/${WORKSPACE_ID}/osdAttachments/${c0Id}`);

      if (c0Snap.exists()) {
        const d0 = c0Snap.data();
        const totalChunks = Number(d0?.totalChunks) || 1;
        const chunks: string[] = [String(d0?.dataChunk || '')];

        if (totalChunks > 1) {
          const reads = Array.from({ length: totalChunks - 1 }, (_, idx) => {
            const cid = `${safeOsdId}_c${idx + 1}`;
            return safeGetDoc(
              doc(db, 'workspaces', WORKSPACE_ID, 'osdAttachments', cid),
              `workspaces/${WORKSPACE_ID}/osdAttachments/${cid}`
            );
          });
          const otherSnaps = await Promise.all(reads);
          for (const s of otherSnaps) {
            if (s.exists()) {
              chunks.push(String(s.data()?.dataChunk || ''));
            }
          }
        }

        const fullDataUrl = chunks.join('');
        if (fullDataUrl && fullDataUrl.startsWith('data:')) {
          StorageService.cacheOsdPdfAttachment(osdId, fullDataUrl);
          return fullDataUrl;
        }
      }
    } catch (err) {
      console.warn('Error fetching osd attachment from cloud:', err);
    }
  }

  try {
    const res = await fetch(`/api/osd/attachment/${encodeURIComponent(osdId)}`);
    if (res.ok) {
      const json = await res.json();
      const url = json?.attachment?.dataUrl;
      if (url && typeof url === 'string') {
        StorageService.cacheOsdPdfAttachment(osdId, url);
        return url;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function preloadOsdAttachments(receipts: OsdReceipt[]): Promise<void> {
  const needsFetch = receipts.filter(
    (r) => r.pdfAttachment && (!r.pdfAttachment.dataUrl || r.pdfAttachment.dataUrl.length === 0)
  );
  if (needsFetch.length === 0) return;

  for (let i = 0; i < needsFetch.length; i += 2) {
    const batch = needsFetch.slice(i, i + 2);
    await Promise.all(batch.map((r) => getOsdPdfAttachment(r.id).catch(() => null)));
  }
}


function serializeMaterial(m: MaterialItem): Record<string, any> {
  return {
    id: cleanStr(m.id, 120, `mat-${Date.now()}`),
    code: cleanStr(m.code, 120, 'VT'),
    name: cleanStr(m.name, 300, cleanStr(m.code, 120, 'Vật tư')),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    category: cleanStr(m.category, 200, 'Chung'),
    packageNo: cleanStr(m.packageNo, 160, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    unitWeightKg: cleanNum(m.unitWeightKg, -1_000_000_000, 1_000_000_000),
    specification: cleanStr(m.specification, 400, ''),
    minStockAlert: cleanNum(m.minStockAlert, 0),
    notes: cleanStr(m.notes, 500, ''),
    updatedAt: cleanNum(m.updatedAt, 1)
  };
}

function deserializeMaterial(m: Record<string, any>): MaterialItem {
  return {
    id: cleanStr(m.id, 120, 'mat-0'),
    code: cleanStr(m.code, 120, 'VT'),
    name: cleanStr(m.name, 300, 'Vật tư'),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    category: cleanStr(m.category, 200, 'Chung'),
    packageNo: cleanStr(m.packageNo, 160, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    unitWeightKg: Number(m.unitWeightKg) || 0,
    specification: cleanStr(m.specification, 400, ''),
    minStockAlert: Number(m.minStockAlert) || 0,
    notes: cleanStr(m.notes, 500, ''),
    updatedAt: Number(m.updatedAt) || 1
  };
}

function serializeInboundItem(it: InboundItemDetail): Record<string, any> {
  return {
    id: cleanStr(it.id, 120, `in-it-${Math.random().toString(36).slice(2, 8)}`),
    materialCode: cleanStr(it.materialCode, 120, ''),
    materialName: cleanStr(it.materialName, 300, ''),
    unit: cleanStr(it.unit, 64, 'Bộ'),
    batchCode: cleanStr(it.batchCode, 120, ''),
    packingListNo: cleanStr(it.packingListNo, 200, ''),
    shipment: cleanStr(it.shipment, 200, ''),
    manufacturer: cleanStr(it.manufacturer, 200, ''),
    supplier: cleanStr(it.supplier, 200, ''),
    packageNo: cleanStr(it.packageNo, 160, ''),
    packageName: cleanStr(it.packageName, 240, ''),
    category: cleanStr(it.category, 200, ''),
    drawingNo: cleanStr(it.drawingNo, 200, ''),
    weightKg: cleanNum(it.weightKg, -1_000_000_000, 1_000_000_000),
    quantity: roundQty(it.quantity),
    unitPrice: cleanNum(it.unitPrice, 0),
    totalPrice: cleanNum(it.totalPrice, 0),
    storageLocation: cleanStr(it.storageLocation, 160, ''),
    warehouseName: cleanStr(it.warehouseName, 200, ''),
    conditionNote: cleanStr(it.conditionNote, 300, ''),
    note: cleanStr(it.note, 400, '')
  };
}

function deserializeInboundItem(m: Record<string, any>): InboundItemDetail {
  return {
    id: cleanStr(m.id, 120, ''),
    materialCode: cleanStr(m.materialCode, 120, ''),
    materialName: cleanStr(m.materialName, 300, ''),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    batchCode: cleanStr(m.batchCode, 120, ''),
    packingListNo: cleanStr(m.packingListNo, 200, ''),
    shipment: cleanStr(m.shipment, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    packageNo: cleanStr(m.packageNo, 160, ''),
    packageName: cleanStr(m.packageName, 240, ''),
    category: cleanStr(m.category, 200, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    weightKg: Number(m.weightKg) || 0,
    quantity: roundQty(m.quantity),
    unitPrice: Number(m.unitPrice) || 0,
    totalPrice: Number(m.totalPrice) || 0,
    storageLocation: cleanStr(m.storageLocation, 160, ''),
    warehouseName: cleanStr(m.warehouseName, 200, ''),
    conditionNote: cleanStr(m.conditionNote, 300, ''),
    note: cleanStr(m.note, 400, '')
  };
}

function serializeOutboundItem(it: OutboundItemDetail): Record<string, any> {
  return {
    id: cleanStr(it.id, 120, `out-it-${Math.random().toString(36).slice(2, 8)}`),
    materialCode: cleanStr(it.materialCode, 120, ''),
    materialName: cleanStr(it.materialName, 300, ''),
    unit: cleanStr(it.unit, 64, 'Bộ'),
    batchCode: cleanStr(it.batchCode, 120, ''),
    warehouseName: cleanStr(it.warehouseName, 200, ''),
    packingListNo: cleanStr(it.packingListNo, 200, ''),
    shipment: cleanStr(it.shipment, 200, ''),
    manufacturer: cleanStr(it.manufacturer, 200, ''),
    supplier: cleanStr(it.supplier, 200, ''),
    packageNo: cleanStr(it.packageNo, 160, ''),
    packageName: cleanStr(it.packageName, 240, ''),
    category: cleanStr(it.category, 200, ''),
    drawingNo: cleanStr(it.drawingNo, 200, ''),
    weightKg: cleanNum(it.weightKg, -1_000_000_000, 1_000_000_000),
    quantity: roundQty(it.quantity),
    unitPrice: cleanNum(it.unitPrice, 0),
    totalPrice: cleanNum(it.totalPrice, 0),
    purpose: cleanStr(it.purpose, 300, ''),
    note: cleanStr(it.note, 400, '')
  };
}

function deserializeOutboundItem(m: Record<string, any>): OutboundItemDetail {
  return {
    id: cleanStr(m.id, 120, ''),
    materialCode: cleanStr(m.materialCode, 120, ''),
    materialName: cleanStr(m.materialName, 300, ''),
    unit: cleanStr(m.unit, 64, 'Bộ'),
    batchCode: cleanStr(m.batchCode, 120, ''),
    warehouseName: cleanStr(m.warehouseName, 200, ''),
    packingListNo: cleanStr(m.packingListNo, 200, ''),
    shipment: cleanStr(m.shipment, 200, ''),
    manufacturer: cleanStr(m.manufacturer, 200, ''),
    supplier: cleanStr(m.supplier, 200, ''),
    packageNo: cleanStr(m.packageNo, 160, ''),
    packageName: cleanStr(m.packageName, 240, ''),
    category: cleanStr(m.category, 200, ''),
    drawingNo: cleanStr(m.drawingNo, 200, ''),
    weightKg: Number(m.weightKg) || 0,
    quantity: roundQty(m.quantity),
    unitPrice: Number(m.unitPrice) || 0,
    totalPrice: Number(m.totalPrice) || 0,
    purpose: cleanStr(m.purpose, 300, ''),
    note: cleanStr(m.note, 400, '')
  };
}

// ============================================================================
// Workspace Membership Bootstrap & Real-Time Listeners
// ============================================================================
async function ensureWorkspaceReady(fbUser: FirebaseUser): Promise<boolean> {
  if (isFirestoreCircuitOpen()) {
    return false;
  }
  if (!fbUser.emailVerified) {
    emitCloudState({
      status: 'error',
      errorMessage: 'Tài khoản Google chưa xác minh email nên không thể kết nối Cloud Firestore.'
    });
    return false;
  }

  if (verifiedWorkspaceUid === fbUser.uid) {
    return true;
  }

  if (workspaceReadyPromise && workspaceReadyUid === fbUser.uid) {
    return workspaceReadyPromise;
  }

  workspaceReadyUid = fbUser.uid;
  workspaceReadyPromise = (async () => {
    const uid = fbUser.uid;
    const displayLabel = cleanStr(
      fbUser.displayName || fbUser.email || 'Thiết bị Kho',
      160,
      'Thiết bị Kho'
    );
    const wsPath = `workspaces/${WORKSPACE_ID}`;
    const memberPath = `workspaces/${WORKSPACE_ID}/members/${uid}`;
    const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
    const memberRef = doc(db, 'workspaces', WORKSPACE_ID, 'members', uid);

    const createInitialBatch = async (memberRole: 'admin' | 'member') => {
      const batch = writeBatch(db);
      const localUsers = StorageService.getUsers();
      const localWhs = StorageService.getWarehouses();
      const localTomb = StorageService.getTombstones();
      const localMats = StorageService.getMaterials();
      const initManifest: WorkspaceManifestDoc = {
        workspaceId: WORKSPACE_ID,
        name: WORKSPACE_NAME,
        ownerUid: uid,
        updatedByUid: uid,
        status: 'active',
        allowSelfJoin: true,
        serverRevision: 1,
        metaRevision: 0,
        materialsRevision: 0,
        materialsCount: 0,
        materialsChunkCount: 0,
        materialsDigest: cleanStr(computeMaterialsDigest([]), 128, '0:0:0:0'),
        metaDigest: cleanStr(
          computeCloudSharedMetaDigest([], [], createEmptyTombstones(), []),
          128,
          '0.0.0:0:0:0'
        ),
        accountChunkCount: 0,
        warehouseChunkCount: 0,
        tombstoneChunkCount: 0,
        inboundIndexChunkCount: 0,
        outboundIndexChunkCount: 0
      };
      batch.set(wsRef, {
        ...initManifest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      batch.set(memberRef, {
        workspaceId: WORKSPACE_ID,
        uid,
        displayName: displayLabel,
        memberRole,
        status: 'active',
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      if (localUsers.length > 0 || localWhs.length > 0 || Object.keys(localTomb.inbound).length > 0) {
        cloudMetaDirty = true;
      }
      if (localMats.length > 0) {
        cloudMaterialsDirty = true;
      }
      try {
        await batch.commit();
        knownExistingPaths.add(wsRef.path);
        knownExistingPaths.add(memberRef.path);
        cachedWsManifest = { data: initManifest, atMs: Date.now() };
      } catch (err) {
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.CREATE, wsPath);
        }
        throw err;
      }
    };

    const hasCompleteManifestSchema = (raw: Record<string, any> | undefined | null): boolean => {
      if (!raw) return false;
      const reqKeys = [
        'workspaceId',
        'name',
        'ownerUid',
        'updatedByUid',
        'status',
        'allowSelfJoin',
        'serverRevision',
        'metaRevision',
        'materialsRevision',
        'materialsCount',
        'materialsChunkCount',
        'materialsDigest',
        'metaDigest',
        'accountChunkCount',
        'warehouseChunkCount',
        'tombstoneChunkCount',
        'inboundIndexChunkCount',
        'outboundIndexChunkCount',
        'createdAt',
        'updatedAt'
      ];
      const actualKeys = Object.keys(raw);
      return actualKeys.length === reqKeys.length && reqKeys.every((k) => k in raw);
    };

    const repairWorkspaceManifestIfNeeded = async (raw: Record<string, any>) => {
      if (hasCompleteManifestSchema(raw) && (!isCloudAdmin(fbUser) || raw.allowSelfJoin === true)) {
        cachedWsManifest = { data: raw as WorkspaceManifestDoc, atMs: Date.now() };
        return;
      }
      const repaired: WorkspaceManifestDoc = {
        workspaceId: WORKSPACE_ID,
        name: cleanStr(raw.name, 200, WORKSPACE_NAME),
        ownerUid: cleanStr(raw.ownerUid, 128, uid),
        updatedByUid: uid,
        status: raw.status === 'archived' && !isCloudAdmin(fbUser) ? 'archived' : 'active',
        allowSelfJoin: isCloudAdmin(fbUser) ? true : raw.allowSelfJoin !== false,
        serverRevision: cleanNum(raw.serverRevision, 1),
        metaRevision: cleanNum(raw.metaRevision, 0),
        materialsRevision: cleanNum(raw.materialsRevision, 0),
        materialsCount: cleanNum(raw.materialsCount, 0),
        materialsChunkCount: cleanNum(raw.materialsChunkCount, 0, 2000),
        materialsDigest: cleanStr(raw.materialsDigest, 128, '0:0:0:0'),
        metaDigest: cleanStr(raw.metaDigest, 128, '0.0.0:0:0:0'),
        accountChunkCount: cleanNum(raw.accountChunkCount, 0, 50),
        warehouseChunkCount: cleanNum(raw.warehouseChunkCount, 0, 50),
        tombstoneChunkCount: cleanNum(raw.tombstoneChunkCount, 0, 500),
        inboundIndexChunkCount: cleanNum(raw.inboundIndexChunkCount, 0, 500),
        outboundIndexChunkCount: cleanNum(raw.outboundIndexChunkCount, 0, 500)
      };
      await setDoc(wsRef, {
        ...repaired,
        createdAt: raw.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      knownExistingPaths.add(wsRef.path);
      cachedWsManifest = { data: repaired, atMs: Date.now() };
    };

    // Đọc memberRef để kiểm tra tư cách thành viên
    const memberSnap = await safeGetDoc(memberRef, memberPath);
    if (memberSnap.exists()) {
      const mData = memberSnap.data();
      if (mData.status !== 'active') {
        emitCloudState({
          status: 'error',
          errorMessage: 'Quyền truy cập đám mây của tài khoản Google này đã bị thu hồi.'
        });
        return false;
      }
      const wsSnap = await safeGetDoc(wsRef, wsPath);
      if (!wsSnap.exists()) {
        await createInitialBatch(isCloudAdmin(fbUser) ? 'admin' : 'member');
      } else {
        if (isCloudAdmin(fbUser)) {
          await repairWorkspaceManifestIfNeeded(wsSnap.data());
        } else {
          cachedWsManifest = { data: wsSnap.data() as WorkspaceManifestDoc, atMs: Date.now() };
        }
      }
      verifiedWorkspaceUid = uid;
      return true;
    }

    if (isCloudAdmin(fbUser)) {
      const wsSnap = await safeGetDoc(wsRef, wsPath);
      if (!wsSnap.exists()) {
        await createInitialBatch('admin');
      } else {
        await repairWorkspaceManifestIfNeeded(wsSnap.data());
        await setDoc(memberRef, {
          workspaceId: WORKSPACE_ID,
          uid,
          displayName: displayLabel,
          memberRole: 'admin',
          status: 'active',
          updatedByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        knownExistingPaths.add(memberRef.path);
      }
      verifiedWorkspaceUid = uid;
      return true;
    }

    // Nhân viên / Quản lý kho (ngoài Admin gốc): tự động đăng ký thành viên vào workspace hiện hữu
    try {
      await setDoc(memberRef, {
        workspaceId: WORKSPACE_ID,
        uid,
        displayName: displayLabel,
        memberRole: 'member',
        status: 'active',
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      knownExistingPaths.add(memberRef.path);
      const wsSnap = await safeGetDoc(wsRef, wsPath);
      if (wsSnap.exists()) {
        cachedWsManifest = { data: wsSnap.data() as WorkspaceManifestDoc, atMs: Date.now() };
      }
      verifiedWorkspaceUid = uid;
      return true;
    } catch {
      try {
        const wsSnap = await safeGetDoc(wsRef, wsPath);
        if (!wsSnap.exists()) {
          await createInitialBatch('member');
          verifiedWorkspaceUid = uid;
          return true;
        }
      } catch {
        // ignore secondary wsRef check error
      }
      emitCloudState({
        status: 'error',
        errorMessage: 'Không thể tham gia không gian đồng bộ kho (Vui lòng nhờ Quản trị viên mở ứng dụng đồng bộ trước 1 lần hoặc kiểm tra quyền truy cập).'
      });
      return false;
    }
  })();

  try {
    return await workspaceReadyPromise;
  } catch (err) {
    workspaceReadyPromise = null;
    workspaceReadyUid = null;
    verifiedWorkspaceUid = null;
    throw err;
  }
}

function attachOsdRealtimeListener(): void {
  if (osdUnsub || !auth.currentUser) return;
  const osdPath = `workspaces/${WORKSPACE_ID}/metaChunks/osd_0`;
  const osdRef = doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_0');

  osdUnsub = onSnapshot(
    osdRef,
    (snap) => {
      if (!snap.exists()) return;
      knownExistingPaths.add(osdRef.path);
      const data = snap.data();
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const remoteOsd: OsdReceipt[] = [];
      for (const raw of rawItems) {
        if (raw && typeof raw === 'object') {
          remoteOsd.push(deserializeOsdPublic(raw));
        }
      }
      StorageService.applyRemoteOsdReceipts(remoteOsd);
      void preloadOsdAttachments(remoteOsd);
      externalOnRemoteOsdChange?.(remoteOsd);
      externalOnRemoteWorkspaceChange?.();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, osdPath);
      } catch {
        // ignore transient error
      }
    }
  );
}

function attachWorkspaceRealtimeListener(): void {
  attachOsdRealtimeListener();
  if (workspaceUnsub || !auth.currentUser) return;
  const wsPath = `workspaces/${WORKSPACE_ID}`;
  const wsRef = doc(db, 'workspaces', WORKSPACE_ID);

  workspaceUnsub = onSnapshot(
    wsRef,
    (snap) => {
      if (!snap.exists()) return;
      knownExistingPaths.add(wsRef.path);
      const data = snap.data() as WorkspaceManifestDoc;
      if (Number(data.serverRevision) !== lastAppliedCloudServerRev) {
        externalOnRemoteWorkspaceChange?.();
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, wsPath);
      } catch {
        emitCloudState({
          status: 'error',
          errorMessage: 'Mất kết nối lắng nghe thời gian thực với Cloud Firestore.'
        });
      }
    }
  );
}

function detachAllListeners(): void {
  if (workspaceUnsub) {
    workspaceUnsub();
    workspaceUnsub = null;
  }
  if (osdUnsub) {
    osdUnsub();
    osdUnsub = null;
  }
  if (sessionUnsub) {
    sessionUnsub();
    sessionUnsub = null;
    watchedSessionDocId = null;
  }
}

// ============================================================================
// Pull / Push Chunk Helpers
// ============================================================================
async function pullMetaFromCloud(wsData: WorkspaceManifestDoc, fbUser: FirebaseUser): Promise<void> {
  const tombReads: Promise<any>[] = [];
  for (let i = 0; i < (Number(wsData.tombstoneChunkCount) || 0); i++) {
    const cid = `tomb_${i}`;
    tombReads.push(
      safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'tombstoneChunks', cid),
        `workspaces/${WORKSPACE_ID}/tombstoneChunks/${cid}`
      )
    );
  }

  const accReads: Promise<any>[] = [];
  for (let i = 0; i < (Number(wsData.accountChunkCount) || 0); i++) {
    const cid = `accounts_${i}`;
    accReads.push(
      safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`
      )
    );
  }

  const whReads: Promise<any>[] = [];
  for (let i = 0; i < (Number(wsData.warehouseChunkCount) || 0); i++) {
    const cid = `warehouses_${i}`;
    whReads.push(
      safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
        `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`
      )
    );
  }

  const osdReads: Promise<any>[] = [
    safeGetDoc(
      doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_0'),
      `workspaces/${WORKSPACE_ID}/metaChunks/osd_0`
    ),
    safeGetDoc(
      doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', 'osd_1'),
      `workspaces/${WORKSPACE_ID}/metaChunks/osd_1`
    )
  ];

  const [tombSnaps, accSnaps, whSnaps, osdSnaps] = await Promise.all([
    Promise.all(tombReads),
    Promise.all(accReads),
    Promise.all(whReads),
    Promise.all(osdReads)
  ]);

  const remoteOsd: OsdReceipt[] = [];
  for (const snap of osdSnaps) {
    if (!snap.exists()) continue;
    const items = Array.isArray(snap.data().items) ? snap.data().items : [];
    for (const raw of items) {
      if (raw && typeof raw === 'object') {
        remoteOsd.push(deserializeOsdPublic(raw));
      }
    }
  }

  const remoteTombstones = createEmptyTombstones();
  for (const snap of tombSnaps) {
    if (!snap.exists()) continue;
    const items = Array.isArray(snap.data().items) ? snap.data().items : [];
    for (const entry of items) {
      const bucket = entry?.bucket as keyof TombstoneMap;
      const key = String(entry?.key || '');
      const ts = Number(entry?.deletedAtMs) || 0;
      if (key && ts > 0 && remoteTombstones[bucket]) {
        remoteTombstones[bucket][key] = Math.max(remoteTombstones[bucket][key] || 0, ts);
      }
    }
  }

  const remoteUsers: User[] = [];
  for (const snap of accSnaps) {
    if (!snap.exists()) continue;
    const items = Array.isArray(snap.data().items) ? snap.data().items : [];
    for (const raw of items) {
      if (raw && typeof raw === 'object') {
        remoteUsers.push(deserializeAccountPublic(raw));
      }
    }
  }

  const remoteWarehouses: Warehouse[] = [];
  for (const snap of whSnaps) {
    if (!snap.exists()) continue;
    const items = Array.isArray(snap.data().items) ? snap.data().items : [];
    for (const raw of items) {
      if (raw && typeof raw === 'object') {
        remoteWarehouses.push(deserializeWarehousePublic(raw));
      }
    }
  }

  // Nếu là Admin và metaRevision thay đổi, tải dữ liệu PII tách biệt (email, phone)
  const targetMetaRev = Number(wsData.metaRevision) || 0;
  if (isCloudAdmin(fbUser) && targetMetaRev !== adminPiiLoadedForMetaRev) {
    await Promise.all([
      Promise.all(
        remoteUsers.map(async (u) => {
          const piiId = makeSafeDocId('accpii', u.id || normUserKey(u.username));
          const snap = await safeGetDoc(
            doc(db, 'workspaces', WORKSPACE_ID, 'accountPrivate', piiId),
            `workspaces/${WORKSPACE_ID}/accountPrivate/${piiId}`
          );
          if (snap.exists()) {
            const d = snap.data();
            if (d.email) {
              u.email = String(d.email);
              u.emailDigest = computeEmailAuthDigest(u.email) || u.emailDigest;
            }
            if (d.phone) u.phone = String(d.phone);
          }
        })
      ),
      Promise.all(
        remoteWarehouses.map(async (w) => {
          const piiId = makeSafeDocId('whpii', w.id || normKey(w.code));
          const snap = await safeGetDoc(
            doc(db, 'workspaces', WORKSPACE_ID, 'warehousePrivate', piiId),
            `workspaces/${WORKSPACE_ID}/warehousePrivate/${piiId}`
          );
          if (snap.exists()) {
            const d = snap.data();
            if (d.phone) w.phone = String(d.phone);
          }
        })
      )
    ]);
    adminPiiLoadedForMetaRev = targetMetaRev;
  }

  StorageService.applyRemoteMeta({
    users: remoteUsers,
    warehouses: remoteWarehouses,
    tombstones: remoteTombstones
  });

  StorageService.applyRemoteOsdReceipts(remoteOsd);
  void preloadOsdAttachments(remoteOsd);
  externalOnRemoteOsdChange?.(remoteOsd);
}

async function pushMetaToCloud(fbUser: FirebaseUser): Promise<{
  accountChunkCount: number;
  warehouseChunkCount: number;
  tombstoneChunkCount: number;
  metaDigest: string;
}> {
  const users = StorageService.getUsers();
  const warehouses = StorageService.getWarehouses();
  const tombstones = StorageService.getTombstones();

  const staged: StagedDocWrite[] = [];

  const accChunks = chunkArray(users.map(serializeAccountPublic), CLOUD_CHUNK_SIZE);
  for (let i = 0; i < accChunks.length; i++) {
    const cid = `accounts_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkType: 'accounts',
        chunkIndex: i
      },
      mutableFields: {
        items: accChunks[i]
      }
    });
  }

  const whChunks = chunkArray(warehouses.map(serializeWarehousePublic), CLOUD_CHUNK_SIZE);
  for (let i = 0; i < whChunks.length; i++) {
    const cid = `warehouses_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkType: 'warehouses',
        chunkIndex: i
      },
      mutableFields: {
        items: whChunks[i]
      }
    });
  }

  const osdList = StorageService.getOsdReceipts();
  const osdChunks = chunkArray(osdList.map(serializeOsdPublic), CLOUD_CHUNK_SIZE);
  const effectiveOsdChunks = osdChunks.length > 0 ? osdChunks : [[]];
  for (let i = 0; i < effectiveOsdChunks.length; i++) {
    const cid = `osd_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkType: 'osd',
        chunkIndex: i
      },
      mutableFields: {
        items: effectiveOsdChunks[i]
      }
    });
  }

  const flatTombItems: Array<{ bucket: string; key: string; deletedAtMs: number }> = [];
  const buckets: Array<keyof TombstoneMap> = ['inbound', 'outbound', 'materials', 'warehouses', 'users', 'osd'];
  for (const b of buckets) {
    const map = tombstones[b] || {};
    for (const [k, ts] of Object.entries(map)) {
      const numTs = Number(ts) || 0;
      if (k && numTs > 0) {
        flatTombItems.push({
          bucket: b,
          key: cleanStr(k, 160, 'k'),
          deletedAtMs: cleanNum(numTs, 1)
        });
      }
    }
  }

  const tombChunks = chunkArray(flatTombItems, CLOUD_CHUNK_SIZE);
  for (let i = 0; i < tombChunks.length; i++) {
    const cid = `tomb_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'tombstoneChunks', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/tombstoneChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkIndex: i
      },
      mutableFields: {
        items: tombChunks[i]
      }
    });
  }

  if (isCloudAdmin(fbUser)) {
    for (const u of users) {
      if (u.email || u.phone) {
        const piiId = makeSafeDocId('accpii', u.id || normUserKey(u.username));
        staged.push({
          ref: doc(db, 'workspaces', WORKSPACE_ID, 'accountPrivate', piiId),
          pathLabel: `workspaces/${WORKSPACE_ID}/accountPrivate/${piiId}`,
          immutableCreateFields: {
            workspaceId: WORKSPACE_ID,
            accountId: piiId
          },
          mutableFields: {
            email: cleanStr(u.email, 200, ''),
            phone: cleanStr(u.phone, 64, '')
          }
        });
      }
    }
    for (const w of warehouses) {
      if (w.phone) {
        const piiId = makeSafeDocId('whpii', w.id || normKey(w.code));
        staged.push({
          ref: doc(db, 'workspaces', WORKSPACE_ID, 'warehousePrivate', piiId),
          pathLabel: `workspaces/${WORKSPACE_ID}/warehousePrivate/${piiId}`,
          immutableCreateFields: {
            workspaceId: WORKSPACE_ID,
            warehouseId: piiId
          },
          mutableFields: {
            phone: cleanStr(w.phone, 64, '')
          }
        });
      }
    }
  }

  await commitStagedWrites(staged);
  cloudMetaDirty = false;

  for (const o of osdList) {
    if (o.pdfAttachment?.dataUrl && o.pdfAttachment.dataUrl.length > 50) {
      void pushSingleOsdAttachment(o.id, o.pdfAttachment).catch(() => {});
    }
  }

  return {
    accountChunkCount: accChunks.length,
    warehouseChunkCount: whChunks.length,
    tombstoneChunkCount: tombChunks.length,
    metaDigest: cleanStr(computeCloudSharedMetaDigest(users, warehouses, tombstones), 128, '0.0.0:0:0:0')
  };
}

async function pullReceiptIndexMap(
  kind: 'inbound' | 'outbound',
  indexChunkCount: number
): Promise<Map<string, CloudReceiptIndexEntry>> {
  const subcol = kind === 'inbound' ? 'inboundIndex' : 'outboundIndex';
  const map = new Map<string, CloudReceiptIndexEntry>();
  if (indexChunkCount <= 0) return map;

  const snaps = await Promise.all(
    Array.from({ length: indexChunkCount }, (_, idx) => {
      const cid = `idx_${idx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, subcol, cid),
        `workspaces/${WORKSPACE_ID}/${subcol}/${cid}`
      );
    })
  );

  for (const snap of snaps) {
    if (!snap.exists()) continue;
    const items = Array.isArray(snap.data().items) ? snap.data().items : [];
    for (const raw of items) {
      if (!raw || !raw.code || !raw.docId) continue;
      map.set(normKey(raw.code), {
        docId: String(raw.docId),
        code: normKey(raw.code),
        id: String(raw.id || raw.code),
        itemCount: Number(raw.itemCount) || 0,
        chunkCount: Number(raw.chunkCount) || 0,
        appUpdatedAt: Number(raw.appUpdatedAt) || 1,
        itemsReplacedAt: Number(raw.itemsReplacedAt) || 0,
        digest: String(raw.digest || '0:0:0')
      });
    }
  }
  return map;
}

async function pullSingleInboundFromCloud(entry: CloudReceiptIndexEntry): Promise<InboundReceipt | null> {
  const headerRef = doc(db, 'workspaces', WORKSPACE_ID, 'inboundReceipts', entry.docId);
  const headerSnap = await safeGetDoc(
    headerRef,
    `workspaces/${WORKSPACE_ID}/inboundReceipts/${entry.docId}`
  );
  if (!headerSnap.exists()) return null;
  const h = headerSnap.data();
  const cCount = Number(h.chunkCount) || 0;

  const itemSnaps = await Promise.all(
    Array.from({ length: cCount }, (_, idx) => {
      const cid = `${entry.docId}_c${idx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'inboundItems', cid),
        `workspaces/${WORKSPACE_ID}/inboundItems/${cid}`
      );
    })
  );

  const allItems: InboundItemDetail[] = [];
  for (const s of itemSnaps) {
    if (!s.exists()) continue;
    const arr = Array.isArray(s.data().items) ? s.data().items : [];
    for (const raw of arr) {
      allItems.push(deserializeInboundItem(raw));
    }
  }

  const sums = sumInboundItems(allItems);
  return {
    id: cleanStr(h.id, 160, entry.id),
    receiptCode: cleanStr(h.receiptCode, 160, entry.code),
    receiptDate: cleanStr(h.receiptDate, 40, ''),
    warehouseId: cleanStr(h.warehouseId, 160, ''),
    warehouseName: cleanStr(h.warehouseName, 300, ''),
    departmentName: cleanStr(h.departmentName, 300, '') || undefined,
    contractNo: cleanStr(h.contractNo, 200, '') || undefined,
    requestNo: cleanStr(h.requestNo, 200, '') || undefined,
    inboundType: h.inboundType === 'return' ? 'return' : 'new',
    amountInWords: cleanStr(h.amountInWords, 500, '') || undefined,
    attachedDocs: cleanStr(h.attachedDocs, 500, '') || undefined,
    supplier: cleanStr(h.supplier, 300, ''),
    manufacturer: cleanStr(h.manufacturer, 300, '') || undefined,
    shipment: cleanStr(h.shipment, 300, ''),
    packingListNo: cleanStr(h.packingListNo, 300, ''),
    delivererName: cleanStr(h.delivererName, 200, ''),
    receiverName: cleanStr(h.receiverName, 200, ''),
    driverVehicleNo: cleanStr(h.driverVehicleNo, 200, '') || undefined,
    notes: cleanStr(h.notes, 2000, '') || undefined,
    items: allItems,
    packageCount: sums.packageCount,
    totalQuantity: sums.totalQuantity,
    totalWeightKg: sums.totalWeightKg,
    totalAmount: sums.totalAmount,
    createdAt: cleanStr(h.createdAtIso, 64, new Date().toISOString()),
    createdBy: cleanStr(h.createdBy, 200, ''),
    updatedAt: Number(h.appUpdatedAt) || 1,
    itemsReplacedAt: Number(h.itemsReplacedAt) > 0 ? Number(h.itemsReplacedAt) : undefined,
    lastEditedBy: cleanStr(h.lastEditedBy, 200, '') || undefined,
    lastEditedAt: cleanStr(h.lastEditedAt, 64, '') || undefined
  };
}

async function pushSingleInboundToCloud(rcp: InboundReceipt): Promise<CloudReceiptIndexEntry> {
  const code = normKey(rcp.receiptCode || rcp.id);
  const docId = makeSafeDocId('in', code);
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const itemChunks = chunkArray(items.map(serializeInboundItem), CLOUD_CHUNK_SIZE);
  const sums = sumInboundItems(items);
  const digest = cleanStr(computeInboundReceiptDigest(rcp), 128, '0:0:0');

  const headerFields = {
    id: cleanStr(rcp.id, 160, docId),
    receiptCode: cleanStr(rcp.receiptCode || rcp.id, 160, code),
    receiptDate: cleanStr(rcp.receiptDate, 40, ''),
    warehouseId: cleanStr(rcp.warehouseId, 160, ''),
    warehouseName: cleanStr(rcp.warehouseName, 300, ''),
    departmentName: cleanStr(rcp.departmentName, 300, ''),
    contractNo: cleanStr(rcp.contractNo, 200, ''),
    requestNo: cleanStr(rcp.requestNo, 200, ''),
    inboundType: rcp.inboundType === 'return' ? 'return' : 'new',
    amountInWords: cleanStr(rcp.amountInWords, 500, ''),
    attachedDocs: cleanStr(rcp.attachedDocs, 500, ''),
    supplier: cleanStr(rcp.supplier, 300, ''),
    manufacturer: cleanStr(rcp.manufacturer, 300, ''),
    shipment: cleanStr(rcp.shipment, 300, ''),
    packingListNo: cleanStr(rcp.packingListNo, 300, ''),
    delivererName: cleanStr(rcp.delivererName, 200, ''),
    receiverName: cleanStr(rcp.receiverName, 200, ''),
    driverVehicleNo: cleanStr(rcp.driverVehicleNo, 200, ''),
    notes: cleanStr(rcp.notes, 2000, ''),
    packageCount: cleanNum(sums.packageCount, 0),
    totalQuantity: cleanNum(sums.totalQuantity, -100_000_000_000, 100_000_000_000),
    totalWeightKg: cleanNum(sums.totalWeightKg, -100_000_000_000, 100_000_000_000),
    totalAmount: cleanNum(sums.totalAmount, -100_000_000_000, 100_000_000_000),
    itemCount: items.length,
    chunkCount: itemChunks.length,
    digest,
    createdBy: cleanStr(rcp.createdBy, 200, ''),
    createdAtIso: cleanStr(rcp.createdAt, 64, new Date().toISOString()),
    appUpdatedAt: cleanNum(rcp.updatedAt || Date.now(), 1),
    itemsReplacedAt: cleanNum(rcp.itemsReplacedAt, 0),
    lastEditedBy: cleanStr(rcp.lastEditedBy, 200, ''),
    lastEditedAt: cleanStr(rcp.lastEditedAt, 64, '')
  };

  // Ghi Header trước (hoặc cùng lô đầu tiên) để thỏa mãn điều kiện exists/existsAfter trên inboundItems
  const staged: StagedDocWrite[] = [
    {
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'inboundReceipts', docId),
      pathLabel: `workspaces/${WORKSPACE_ID}/inboundReceipts/${docId}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        docId
      },
      mutableFields: headerFields
    }
  ];

  for (let i = 0; i < itemChunks.length; i++) {
    const cid = `${docId}_c${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'inboundItems', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/inboundItems/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        receiptDocId: docId,
        chunkIndex: i
      },
      mutableFields: {
        items: itemChunks[i]
      }
    });
  }

  await commitStagedWrites(staged);

  return {
    docId,
    code,
    id: headerFields.id,
    itemCount: items.length,
    chunkCount: itemChunks.length,
    appUpdatedAt: headerFields.appUpdatedAt,
    itemsReplacedAt: headerFields.itemsReplacedAt,
    digest
  };
}

async function pullSingleOutboundFromCloud(entry: CloudReceiptIndexEntry): Promise<OutboundReceipt | null> {
  const headerRef = doc(db, 'workspaces', WORKSPACE_ID, 'outboundReceipts', entry.docId);
  const headerSnap = await safeGetDoc(
    headerRef,
    `workspaces/${WORKSPACE_ID}/outboundReceipts/${entry.docId}`
  );
  if (!headerSnap.exists()) return null;
  const h = headerSnap.data();
  const cCount = Number(h.chunkCount) || 0;

  const itemSnaps = await Promise.all(
    Array.from({ length: cCount }, (_, idx) => {
      const cid = `${entry.docId}_c${idx}`;
      return safeGetDoc(
        doc(db, 'workspaces', WORKSPACE_ID, 'outboundItems', cid),
        `workspaces/${WORKSPACE_ID}/outboundItems/${cid}`
      );
    })
  );

  const allItems: OutboundItemDetail[] = [];
  for (const s of itemSnaps) {
    if (!s.exists()) continue;
    const arr = Array.isArray(s.data().items) ? s.data().items : [];
    for (const raw of arr) {
      allItems.push(deserializeOutboundItem(raw));
    }
  }

  const sums = sumOutboundItems(allItems);
  return {
    id: cleanStr(h.id, 160, entry.id),
    issueCode: cleanStr(h.issueCode, 160, entry.code),
    issueDate: cleanStr(h.issueDate, 40, ''),
    warehouseId: cleanStr(h.warehouseId, 160, ''),
    warehouseName: cleanStr(h.warehouseName, 300, ''),
    departmentName: cleanStr(h.departmentName, 300, '') || undefined,
    requestNo: cleanStr(h.requestNo, 200, '') || undefined,
    outboundType: h.outboundType === 'transfer' ? 'transfer' : 'issue',
    projectName: cleanStr(h.projectName, 300, '') || undefined,
    recipientDepartment: cleanStr(h.recipientDepartment, 300, ''),
    recipientName: cleanStr(h.recipientName, 200, ''),
    issuerName: cleanStr(h.issuerName, 200, ''),
    notes: cleanStr(h.notes, 2000, '') || undefined,
    items: allItems,
    packingListSummary: cleanStr(h.packingListSummary, 500, '') || computePackingListSummary(allItems),
    totalQuantity: sums.totalQuantity,
    totalWeightKg: sums.totalWeightKg,
    totalAmount: Number(h.totalAmount) || 0,
    createdAt: cleanStr(h.createdAtIso, 64, new Date().toISOString()),
    createdBy: cleanStr(h.createdBy, 200, ''),
    updatedAt: Number(h.appUpdatedAt) || 1,
    itemsReplacedAt: Number(h.itemsReplacedAt) > 0 ? Number(h.itemsReplacedAt) : undefined,
    lastEditedBy: cleanStr(h.lastEditedBy, 200, '') || undefined,
    lastEditedAt: cleanStr(h.lastEditedAt, 64, '') || undefined
  };
}

async function pushSingleOutboundToCloud(rcp: OutboundReceipt): Promise<CloudReceiptIndexEntry> {
  const code = normKey(rcp.issueCode || rcp.id);
  const docId = makeSafeDocId('out', code);
  const items = Array.isArray(rcp.items) ? rcp.items : [];
  const itemChunks = chunkArray(items.map(serializeOutboundItem), CLOUD_CHUNK_SIZE);
  const sums = sumOutboundItems(items);
  const digest = cleanStr(computeOutboundReceiptDigest(rcp), 128, '0:0:0');

  const headerFields = {
    id: cleanStr(rcp.id, 160, docId),
    issueCode: cleanStr(rcp.issueCode || rcp.id, 160, code),
    issueDate: cleanStr(rcp.issueDate, 40, ''),
    warehouseId: cleanStr(rcp.warehouseId, 160, ''),
    warehouseName: cleanStr(rcp.warehouseName, 300, ''),
    departmentName: cleanStr(rcp.departmentName, 300, ''),
    requestNo: cleanStr(rcp.requestNo, 200, ''),
    outboundType: rcp.outboundType === 'transfer' ? 'transfer' : 'issue',
    projectName: cleanStr(rcp.projectName, 300, ''),
    recipientDepartment: cleanStr(rcp.recipientDepartment, 300, ''),
    recipientName: cleanStr(rcp.recipientName, 200, ''),
    issuerName: cleanStr(rcp.issuerName, 200, ''),
    notes: cleanStr(rcp.notes, 2000, ''),
    packingListSummary: cleanStr(rcp.packingListSummary || computePackingListSummary(items), 500, ''),
    totalQuantity: cleanNum(sums.totalQuantity, -100_000_000_000, 100_000_000_000),
    totalWeightKg: cleanNum(sums.totalWeightKg, -100_000_000_000, 100_000_000_000),
    totalAmount: cleanNum(rcp.totalAmount, -100_000_000_000, 100_000_000_000),
    itemCount: items.length,
    chunkCount: itemChunks.length,
    digest,
    createdBy: cleanStr(rcp.createdBy, 200, ''),
    createdAtIso: cleanStr(rcp.createdAt, 64, new Date().toISOString()),
    appUpdatedAt: cleanNum(rcp.updatedAt || Date.now(), 1),
    itemsReplacedAt: cleanNum(rcp.itemsReplacedAt, 0),
    lastEditedBy: cleanStr(rcp.lastEditedBy, 200, ''),
    lastEditedAt: cleanStr(rcp.lastEditedAt, 64, '')
  };

  const staged: StagedDocWrite[] = [
    {
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'outboundReceipts', docId),
      pathLabel: `workspaces/${WORKSPACE_ID}/outboundReceipts/${docId}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        docId
      },
      mutableFields: headerFields
    }
  ];

  for (let i = 0; i < itemChunks.length; i++) {
    const cid = `${docId}_c${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'outboundItems', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/outboundItems/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        receiptDocId: docId,
        chunkIndex: i
      },
      mutableFields: {
        items: itemChunks[i]
      }
    });
  }

  await commitStagedWrites(staged);

  return {
    docId,
    code,
    id: headerFields.id,
    itemCount: items.length,
    chunkCount: itemChunks.length,
    appUpdatedAt: headerFields.appUpdatedAt,
    itemsReplacedAt: headerFields.itemsReplacedAt,
    digest
  };
}

async function writeReceiptIndexChunks(
  kind: 'inbound' | 'outbound',
  entriesMap: Map<string, CloudReceiptIndexEntry>
): Promise<number> {
  const subcol = kind === 'inbound' ? 'inboundIndex' : 'outboundIndex';
  const sortedEntries = Array.from(entriesMap.values()).sort((a, b) => b.appUpdatedAt - a.appUpdatedAt);
  const chunks = chunkArray(sortedEntries, CLOUD_CHUNK_SIZE);

  const staged: StagedDocWrite[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const cid = `idx_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, subcol, cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/${subcol}/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        receiptKind: kind,
        chunkIndex: i
      },
      mutableFields: {
        items: chunks[i]
      }
    });
  }

  await commitStagedWrites(staged);
  return chunks.length;
}

async function pullMaterialsFromCloud(chunkCount: number): Promise<void> {
  if (chunkCount <= 0) return;
  for (let start = 0; start < chunkCount; start += 25) {
    const end = Math.min(chunkCount, start + 25);
    const snaps = await Promise.all(
      Array.from({ length: end - start }, (_, idx) => {
        const cIdx = start + idx;
        const cid = `chunk_${cIdx}`;
        return safeGetDoc(
          doc(db, 'workspaces', WORKSPACE_ID, 'materialChunks', cid),
          `workspaces/${WORKSPACE_ID}/materialChunks/${cid}`
        );
      })
    );
    const batchItems: MaterialItem[] = [];
    for (const snap of snaps) {
      if (!snap.exists()) continue;
      const arr = Array.isArray(snap.data().items) ? snap.data().items : [];
      for (const raw of arr) {
        if (raw && typeof raw === 'object') {
          batchItems.push(deserializeMaterial(raw));
        }
      }
    }
    if (batchItems.length > 0) {
      StorageService.applyRemoteMaterials(batchItems);
    }
  }
}

async function pushMaterialsToCloud(): Promise<{
  materialsCount: number;
  materialsChunkCount: number;
  materialsDigest: string;
}> {
  const mats = StorageService.getMaterials();
  const chunks = chunkArray(mats.map(serializeMaterial), CLOUD_CHUNK_SIZE);
  const staged: StagedDocWrite[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const cid = `chunk_${i}`;
    staged.push({
      ref: doc(db, 'workspaces', WORKSPACE_ID, 'materialChunks', cid),
      pathLabel: `workspaces/${WORKSPACE_ID}/materialChunks/${cid}`,
      immutableCreateFields: {
        workspaceId: WORKSPACE_ID,
        chunkIndex: i
      },
      mutableFields: {
        items: chunks[i]
      }
    });
  }

  await commitStagedWrites(staged);
  cloudMaterialsDirty = false;

  return {
    materialsCount: mats.length,
    materialsChunkCount: chunks.length,
    materialsDigest: cleanStr(computeMaterialsDigest(mats), 128, '0:0:0:0')
  };
}

// ============================================================================
// Public FirestoreSyncService
// ============================================================================
export const FirestoreSyncService = {
  init(callbacks: {
    onRemoteWorkspaceChange: () => void;
    onRemoteSessionSnapshot: (remoteData: Record<string, any>) => void;
    onRemoteOsdChange?: (remoteOsd: OsdReceipt[]) => void;
    isLocalSessionStillActive?: (sessionToken: string) => boolean;
  }): void {
    externalOnRemoteWorkspaceChange = callbacks.onRemoteWorkspaceChange;
    externalOnRemoteSessionSnapshot = callbacks.onRemoteSessionSnapshot;
    externalOnRemoteOsdChange = callbacks.onRemoteOsdChange || null;
    externalIsLocalSessionStillActive = callbacks.isLocalSessionStillActive || null;

    onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        detachAllListeners();
        knownExistingPaths.clear();
        workspaceReadyPromise = null;
        workspaceReadyUid = null;
        verifiedWorkspaceUid = null;
        cachedWsManifest = null;
        adminPiiLoadedForMetaRev = -1;
        lastAppliedCloudServerRev = -1;
        lastAppliedCloudMetaRev = -1;
        emitCloudState({
          authReady: true,
          status: 'disconnected',
          cloudEmail: null,
          cloudDisplayName: null,
          cloudUid: null,
          errorMessage: null
        });
        return;
      }

      if (currentState.cloudUid && currentState.cloudUid !== fbUser.uid) {
        detachAllListeners();
        knownExistingPaths.clear();
        workspaceReadyPromise = null;
        workspaceReadyUid = null;
        verifiedWorkspaceUid = null;
        cachedWsManifest = null;
        adminPiiLoadedForMetaRev = -1;
        lastAppliedCloudServerRev = -1;
        lastAppliedCloudMetaRev = -1;
      }

      emitCloudState({
        authReady: true,
        status: verifiedWorkspaceUid === fbUser.uid ? 'connected' : 'connecting',
        cloudEmail: fbUser.email || null,
        cloudDisplayName: fbUser.displayName || null,
        cloudUid: fbUser.uid,
        errorMessage: null
      });

      // Khi người dùng đang thao tác bấm nút Đăng nhập Google, nhường toàn bộ băng thông cho bước cấp phiên đăng nhập trước
      if (interactiveAuthInFlight || isFirestoreCircuitOpen()) {
        return;
      }

      try {
        const ok = await ensureWorkspaceReady(fbUser);
        if (!ok) return;
        attachWorkspaceRealtimeListener();
        emitCloudState({
          status: 'connected',
          errorMessage: null
        });
        if (fbUser.email) {
          this.watchActiveSession(fbUser.email);
        }
        externalOnRemoteWorkspaceChange?.();
      } catch (err) {
        console.warn('Cloud workspace bootstrap warning:', err);
        emitCloudState({
          status: 'error',
          errorMessage: 'Không thể khởi tạo kết nối đồng bộ đám mây. Vui lòng thử lại.'
        });
      }
    });
  },

  getState(): CloudSyncSnapshotState {
    return currentState;
  },

  isCloudConnected(): boolean {
    return Boolean(auth.currentUser && auth.currentUser.emailVerified && currentState.status === 'connected');
  },

  hasAuthenticatedCloudUser(): boolean {
    return Boolean(auth.currentUser && auth.currentUser.emailVerified && !isFirestoreCircuitOpen());
  },

  canAttemptCloudAuth(): boolean {
    return Boolean(auth.currentUser && auth.currentUser.emailVerified);
  },

  async ensureReadyForAuth(timeoutMs = 2500): Promise<boolean> {
    if (!currentState.authReady) {
      await Promise.race([
        new Promise<void>((resolve) => {
          if (currentState.authReady) {
            resolve();
            return;
          }
          authReadyWaiters.add(resolve);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
      ]);
    }
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      return false;
    }
    if (currentState.status !== 'connected') {
      try {
        const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
        if (!tokenOk) return false;
        const ok = await ensureWorkspaceReady(fbUser);
        if (ok) {
          attachWorkspaceRealtimeListener();
          emitCloudState({ status: 'connected', errorMessage: null });
          return true;
        }
      } catch {
        return false;
      }
    }
    return Boolean(auth.currentUser && auth.currentUser.emailVerified && currentState.status === 'connected');
  },

  markTokenRevoked(sessionToken?: string | null): void {
    rememberRevokedCloudToken(sessionToken);
  },

  subscribeState(listener: (state: CloudSyncSnapshotState) => void): () => void {
    stateListeners.add(listener);
    listener(currentState);
    return () => {
      stateListeners.delete(listener);
    };
  },

  markLocalMutation(kind: 'meta' | 'materials' | 'inbound' | 'outbound' | 'osd'): void {
    if (kind === 'meta' || kind === 'osd') cloudMetaDirty = true;
    if (kind === 'materials') cloudMaterialsDirty = true;
  },

  getCurrentFirebaseUser(): FirebaseUser | null {
    return auth.currentUser;
  },

  async authenticateGooglePopup(options?: {
    forceSelectAccount?: boolean;
    reuseExistingIfAvailable?: boolean;
  }): Promise<{
    success: boolean;
    cloudReady: boolean;
    fbUser?: FirebaseUser;
    email?: string | null;
    displayName?: string | null;
    uid?: string | null;
    message: string;
  }> {
    interactiveAuthInFlight = true;
    try {
      let fbUser: FirebaseUser | null = null;
      const shouldForcePicker = Boolean(options?.forceSelectAccount);
      const canReuse =
        Boolean(options?.reuseExistingIfAvailable) &&
        !shouldForcePicker &&
        Boolean(auth.currentUser && auth.currentUser.email);

      if (canReuse && auth.currentUser) {
        const validToken = await ensureValidFirebaseAuthToken(auth.currentUser);
        if (validToken && auth.currentUser) {
          fbUser = auth.currentUser;
        }
      }

      if (!fbUser) {
        emitCloudState({ status: 'connecting', errorMessage: null });
        // Gọi signInWithGooglePopup trực tiếp trong call-stack sự kiện click, trả về ngay lập tức khi Popup đóng (~0ms độ trễ)
        const cred = await signInWithGooglePopup(shouldForcePicker || !auth.currentUser);
        fbUser = cred.user;
      }

      if (!fbUser || !fbUser.email) {
        return {
          success: false,
          cloudReady: false,
          message: 'Tài khoản Google không cung cấp địa chỉ email hợp lệ. Vui lòng chọn tài khoản Google khác.'
        };
      }

      emitCloudState({
        authReady: true,
        cloudEmail: fbUser.email,
        cloudDisplayName: fbUser.displayName || null,
        cloudUid: fbUser.uid,
        errorMessage: null
      });

      return {
        success: true,
        cloudReady: !isFirestoreCircuitOpen(),
        fbUser,
        email: fbUser.email,
        displayName: fbUser.displayName,
        uid: fbUser.uid,
        message: `Đã xác thực tài khoản Google (${fbUser.email}) thành công!`
      };
    } catch (err: any) {
      const code = String(err?.code || '');
      let msg = 'Không thể đăng nhập bằng tài khoản Google. Vui lòng thử lại.';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        msg = 'Bạn đã đóng cửa sổ chọn tài khoản Google trước khi hoàn tất đăng nhập.';
      } else if (code === 'auth/popup-blocked') {
        msg =
          'Trình duyệt đã chặn cửa sổ bật lên (Popup). Vui lòng cho phép Popup trên thanh địa chỉ trình duyệt rồi nhấn đăng nhập lại.';
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'tên miền hiện tại';
        msg = `Tên miền "${host}" chưa được thêm vào Authorized Domains trên Firebase Authentication. Vui lòng thêm "${host}" trong Firebase Console > Authentication > Settings > Authorized domains.`;
      } else if (code === 'auth/network-request-failed') {
        msg = 'Kết nối mạng bị gián đoạn khi xác thực với Google. Vui lòng kiểm tra mạng và thử lại.';
      }
      emitCloudState({
        status: auth.currentUser ? 'connected' : 'disconnected',
        errorMessage: code === 'auth/popup-closed-by-user' ? null : msg
      });
      return { success: false, cloudReady: false, message: msg };
    } finally {
      interactiveAuthInFlight = false;
    }
  },

  async connectGoogleAccount(): Promise<{
    success: boolean;
    email?: string | null;
    displayName?: string | null;
    message: string;
  }> {
    const authRes = await this.authenticateGooglePopup({
      forceSelectAccount: true,
      reuseExistingIfAvailable: false
    });
    if (!authRes.success || !authRes.fbUser) {
      return {
        success: false,
        message: authRes.message
      };
    }
    try {
      const wsOk = await Promise.race<boolean>([
        ensureWorkspaceReady(authRes.fbUser),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
      ]);
      if (!wsOk) {
        return {
          success: false,
          email: authRes.email,
          displayName: authRes.displayName,
          message:
            currentState.errorMessage ||
            'Chưa thể kết nối không gian làm việc Google Cloud Firestore. Vui lòng kiểm tra mạng và thử lại.'
        };
      }
      attachWorkspaceRealtimeListener();
      emitCloudState({ status: 'connected', errorMessage: null });
      void this.reconcileWithCloud();
    } catch {
      return {
        success: false,
        email: authRes.email,
        displayName: authRes.displayName,
        message:
          currentState.errorMessage ||
          'Không thể kết nối không gian làm việc Google Cloud Firestore.'
      };
    }
    return {
      success: true,
      email: authRes.email,
      displayName: authRes.displayName,
      message: `Đã kết nối đồng bộ đám mây (${authRes.email || 'Google'}) thành công!`
    };
  },

  async disconnectGoogleAccount(): Promise<void> {
    detachAllListeners();
    knownExistingPaths.clear();
    workspaceReadyPromise = null;
    workspaceReadyUid = null;
    verifiedWorkspaceUid = null;
    cachedWsManifest = null;
    adminPiiLoadedForMetaRev = -1;
    lastAppliedCloudServerRev = -1;
    lastAppliedCloudMetaRev = -1;
    await signOutAndPurgeFirebaseAuth();
    emitCloudState({
      authReady: true,
      status: 'disconnected',
      cloudEmail: null,
      cloudDisplayName: null,
      cloudUid: null,
      errorMessage: null
    });
  },

  watchActiveSession(userKey: string | null): void {
    const fbUser = auth.currentUser;
    if (!userKey || !fbUser || !fbUser.emailVerified) {
      if (sessionUnsub) {
        sessionUnsub();
        sessionUnsub = null;
        watchedSessionDocId = null;
      }
      return;
    }

    const canonicalKey = canonicalUserSessionKey(userKey);
    const sessionDocId = makeSafeDocId('sess', canonicalKey);
    if (sessionUnsub && watchedSessionDocId === sessionDocId) return;

    if (sessionUnsub) {
      sessionUnsub();
      sessionUnsub = null;
    }
    watchedSessionDocId = sessionDocId;
    const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
    const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);

    sessionUnsub = onSnapshot(
      sessRef,
      (snap) => {
        if (!snap.exists()) return;
        knownExistingPaths.add(sessRef.path);
        externalOnRemoteSessionSnapshot?.(snap.data());
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, sessPath);
        } catch {
          // ignore transient session listener error
        }
      }
    );
  },

  async reconcileWithCloud(): Promise<boolean> {
    const res = await this.reconcileWithCloudDetailed();
    return res.ok;
  },

  async reconcileWithCloudDetailed(): Promise<{ ok: boolean; pulledChanges: boolean }> {
    if (isFirestoreCircuitOpen() || interactiveAuthInFlight) {
      return { ok: false, pulledChanges: false };
    }
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      return { ok: false, pulledChanges: false };
    }

    if (isCloudReconciling) {
      pendingCloudReconcile = true;
      return { ok: true, pulledChanges: false };
    }

    isCloudReconciling = true;
    let pulledChanges = false;
    try {
      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { ok: false, pulledChanges: false };
      attachWorkspaceRealtimeListener();

      const wsPath = `workspaces/${WORKSPACE_ID}`;
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      let wsData: WorkspaceManifestDoc | null = null;
      if (cachedWsManifest && Date.now() - cachedWsManifest.atMs < 2500) {
        wsData = cachedWsManifest.data;
        cachedWsManifest = null;
      } else {
        const wsSnap = await safeGetDoc(wsRef, wsPath);
        if (!wsSnap.exists()) return { ok: false, pulledChanges: false };
        wsData = wsSnap.data() as WorkspaceManifestDoc;
      }

      let nextAccountChunkCount = Number(wsData.accountChunkCount) || 0;
      let nextWarehouseChunkCount = Number(wsData.warehouseChunkCount) || 0;
      let nextTombstoneChunkCount = Number(wsData.tombstoneChunkCount) || 0;
      let nextMetaDigest = String(wsData.metaDigest || '0.0.0:0:0:0');
      let nextMetaRevision = Number(wsData.metaRevision) || 0;

      let nextMaterialsCount = Number(wsData.materialsCount) || 0;
      let nextMaterialsChunkCount = Number(wsData.materialsChunkCount) || 0;
      let nextMaterialsDigest = String(wsData.materialsDigest || '0:0:0:0');
      let nextMaterialsRevision = Number(wsData.materialsRevision) || 0;

      let nextInboundIndexChunkCount = Number(wsData.inboundIndexChunkCount) || 0;
      let nextOutboundIndexChunkCount = Number(wsData.outboundIndexChunkCount) || 0;
      let manifestMutated = false;

      // Fast-path: Nếu ServerRevision trên Cloud không đổi và máy hiện tại không có thay đổi mới nào sau lần đồng bộ trước -> hoàn tất tức thì
      if (
        lastAppliedCloudServerRev >= 0 &&
        Number(wsData.serverRevision) === lastAppliedCloudServerRev &&
        !cloudMetaDirty &&
        !cloudMaterialsDirty
      ) {
        const quickMetaDigest = computeCloudSharedMetaDigest(
          StorageService.getUsers(),
          StorageService.getWarehouses(),
          StorageService.getTombstones()
        );
        const quickMatDigest = computeMaterialsDigest(StorageService.getMaterials());
        if (quickMetaDigest === nextMetaDigest && quickMatDigest === nextMaterialsDigest) {
          emitCloudState({
            status: 'connected',
            lastSyncedAt: Date.now(),
            errorMessage: null
          });
          return { ok: true, pulledChanges: false };
        }
      }

      // 1. Đồng bộ Meta (Users + Warehouses + Tombstones)
      const localMetaDigestBefore = computeCloudSharedMetaDigest(
        StorageService.getUsers(),
        StorageService.getWarehouses(),
        StorageService.getTombstones()
      );
      if (
        Number(wsData.metaRevision) !== lastAppliedCloudMetaRev ||
        localMetaDigestBefore !== nextMetaDigest
      ) {
        await pullMetaFromCloud(wsData, fbUser);
        lastAppliedCloudMetaRev = Number(wsData.metaRevision) || 0;
        pulledChanges = true;
      }

      const localMetaDigestAfter = computeCloudSharedMetaDigest(
        StorageService.getUsers(),
        StorageService.getWarehouses(),
        StorageService.getTombstones()
      );
      if (cloudMetaDirty || localMetaDigestAfter !== nextMetaDigest) {
        const pushedMeta = await pushMetaToCloud(fbUser);
        nextAccountChunkCount = pushedMeta.accountChunkCount;
        nextWarehouseChunkCount = pushedMeta.warehouseChunkCount;
        nextTombstoneChunkCount = pushedMeta.tombstoneChunkCount;
        nextMetaDigest = pushedMeta.metaDigest;
        nextMetaRevision = (Number(wsData.metaRevision) || 0) + 1;
        lastAppliedCloudMetaRev = nextMetaRevision;
        manifestMutated = true;
      }

      const tombstones = StorageService.getTombstones();

      // 2 & 3. Tải song song chỉ mục Phiếu Nhập & Phiếu Xuất từ Cloud
      const [cloudInMap, cloudOutMap] = await Promise.all([
        pullReceiptIndexMap('inbound', nextInboundIndexChunkCount),
        pullReceiptIndexMap('outbound', nextOutboundIndexChunkCount)
      ]);

      for (const entry of Array.from(cloudInMap.values())) {
        knownExistingPaths.add(doc(db, 'workspaces', WORKSPACE_ID, 'inboundReceipts', entry.docId).path);
        for (let c = 0; c < entry.chunkCount; c++) {
          knownExistingPaths.add(doc(db, 'workspaces', WORKSPACE_ID, 'inboundItems', `${entry.docId}_c${c}`).path);
        }
      }
      for (const entry of Array.from(cloudOutMap.values())) {
        knownExistingPaths.add(doc(db, 'workspaces', WORKSPACE_ID, 'outboundReceipts', entry.docId).path);
        for (let c = 0; c < entry.chunkCount; c++) {
          knownExistingPaths.add(doc(db, 'workspaces', WORKSPACE_ID, 'outboundItems', `${entry.docId}_c${c}`).path);
        }
      }

      const localInbounds = StorageService.getInboundReceipts();
      const localInMap = new Map<string, InboundReceipt>();
      for (const r of localInbounds) {
        localInMap.set(normKey(r.receiptCode || r.id), r);
      }

      const inEntriesToPull: CloudReceiptIndexEntry[] = [];
      let inboundIndexChanged = false;

      for (const [code, entry] of Array.from(cloudInMap.entries())) {
        if (isRecordDeleted(tombstones.inbound, [entry.id, code, entry.code], entry.appUpdatedAt)) {
          cloudInMap.delete(code);
          inboundIndexChanged = true;
          continue;
        }
        const localRcp = localInMap.get(code);
        const localRep = Number(localRcp?.itemsReplacedAt) || 0;
        const cloudRep = Number(entry.itemsReplacedAt) || 0;
        if (!localRcp) {
          inEntriesToPull.push(entry);
        } else if (localRep > cloudRep) {
          continue;
        } else if (
          cloudRep > localRep ||
          localRcp.items.length < entry.itemCount ||
          computeInboundReceiptDigest(localRcp) !== entry.digest
        ) {
          inEntriesToPull.push(entry);
        }
      }

      if (inEntriesToPull.length > 0) {
        for (let i = 0; i < inEntriesToPull.length; i += 12) {
          const slice = inEntriesToPull.slice(i, i + 12);
          const pulled = await Promise.all(slice.map((e) => pullSingleInboundFromCloud(e)));
          const valid = pulled.filter((x): x is InboundReceipt => Boolean(x));
          if (valid.length > 0) {
            StorageService.applyRemoteInboundReceipts(valid);
            pulledChanges = true;
          }
        }
      }

      const refreshedInbounds = StorageService.getInboundReceipts();
      const inboundsToPush: Array<{ code: string; rcp: InboundReceipt }> = [];
      for (const rcp of refreshedInbounds) {
        const code = normKey(rcp.receiptCode || rcp.id);
        const cloudEntry = cloudInMap.get(code);
        const localRep = Number(rcp.itemsReplacedAt) || 0;
        const cloudRep = Number(cloudEntry?.itemsReplacedAt) || 0;
        if (
          !cloudEntry ||
          localRep > cloudRep ||
          (localRep === cloudRep && rcp.items.length > cloudEntry.itemCount) ||
          computeInboundReceiptDigest(rcp) !== cloudEntry.digest
        ) {
          inboundsToPush.push({ code, rcp });
        }
      }

      if (inboundsToPush.length > 0) {
        for (let i = 0; i < inboundsToPush.length; i += 6) {
          const slice = inboundsToPush.slice(i, i + 6);
          const updatedEntries = await Promise.all(slice.map((item) => pushSingleInboundToCloud(item.rcp)));
          for (let j = 0; j < slice.length; j++) {
            cloudInMap.set(slice[j].code, updatedEntries[j]);
          }
        }
        inboundIndexChanged = true;
      }

      if (inboundIndexChanged) {
        nextInboundIndexChunkCount = await writeReceiptIndexChunks('inbound', cloudInMap);
        manifestMutated = true;
      }

      // 3. Đồng bộ Phiếu Xuất Kho (Outbound Receipts)
      const localOutbounds = StorageService.getOutboundReceipts();
      const localOutMap = new Map<string, OutboundReceipt>();
      for (const r of localOutbounds) {
        localOutMap.set(normKey(r.issueCode || r.id), r);
      }

      const outEntriesToPull: CloudReceiptIndexEntry[] = [];
      let outboundIndexChanged = false;

      for (const [code, entry] of Array.from(cloudOutMap.entries())) {
        if (isRecordDeleted(tombstones.outbound, [entry.id, code, entry.code], entry.appUpdatedAt)) {
          cloudOutMap.delete(code);
          outboundIndexChanged = true;
          continue;
        }
        const localRcp = localOutMap.get(code);
        const localRep = Number(localRcp?.itemsReplacedAt) || 0;
        const cloudRep = Number(entry.itemsReplacedAt) || 0;
        if (!localRcp) {
          outEntriesToPull.push(entry);
        } else if (localRep > cloudRep) {
          continue;
        } else if (
          cloudRep > localRep ||
          localRcp.items.length < entry.itemCount ||
          computeOutboundReceiptDigest(localRcp) !== entry.digest
        ) {
          outEntriesToPull.push(entry);
        }
      }

      if (outEntriesToPull.length > 0) {
        for (let i = 0; i < outEntriesToPull.length; i += 12) {
          const slice = outEntriesToPull.slice(i, i + 12);
          const pulled = await Promise.all(slice.map((e) => pullSingleOutboundFromCloud(e)));
          const valid = pulled.filter((x): x is OutboundReceipt => Boolean(x));
          if (valid.length > 0) {
            StorageService.applyRemoteOutboundReceipts(valid);
            pulledChanges = true;
          }
        }
      }

      const refreshedOutbounds = StorageService.getOutboundReceipts();
      const outboundsToPush: Array<{ code: string; rcp: OutboundReceipt }> = [];
      for (const rcp of refreshedOutbounds) {
        const code = normKey(rcp.issueCode || rcp.id);
        const cloudEntry = cloudOutMap.get(code);
        const localRep = Number(rcp.itemsReplacedAt) || 0;
        const cloudRep = Number(cloudEntry?.itemsReplacedAt) || 0;
        if (
          !cloudEntry ||
          localRep > cloudRep ||
          (localRep === cloudRep && rcp.items.length > cloudEntry.itemCount) ||
          computeOutboundReceiptDigest(rcp) !== cloudEntry.digest
        ) {
          outboundsToPush.push({ code, rcp });
        }
      }

      if (outboundsToPush.length > 0) {
        for (let i = 0; i < outboundsToPush.length; i += 6) {
          const slice = outboundsToPush.slice(i, i + 6);
          const updatedEntries = await Promise.all(slice.map((item) => pushSingleOutboundToCloud(item.rcp)));
          for (let j = 0; j < slice.length; j++) {
            cloudOutMap.set(slice[j].code, updatedEntries[j]);
          }
        }
        outboundIndexChanged = true;
      }

      if (outboundIndexChanged) {
        nextOutboundIndexChunkCount = await writeReceiptIndexChunks('outbound', cloudOutMap);
        manifestMutated = true;
      }

      // 4. Đồng bộ Danh Mục Vật Tư (Materials)
      const preMatDigest = computeMaterialsDigest(StorageService.getMaterials());
      if (nextMaterialsChunkCount > 0 && preMatDigest !== nextMaterialsDigest) {
        await pullMaterialsFromCloud(nextMaterialsChunkCount);
        pulledChanges = true;
      }

      const postMatDigest = computeMaterialsDigest(StorageService.getMaterials());
      if (cloudMaterialsDirty || postMatDigest !== nextMaterialsDigest) {
        const pushedMats = await pushMaterialsToCloud();
        nextMaterialsCount = pushedMats.materialsCount;
        nextMaterialsChunkCount = pushedMats.materialsChunkCount;
        nextMaterialsDigest = pushedMats.materialsDigest;
        nextMaterialsRevision = (Number(wsData.materialsRevision) || 0) + 1;
        manifestMutated = true;
      }

      // 5. Cập nhật WorkspaceManifest nếu có bất kỳ thay đổi mới đẩy lên Cloud
      if (manifestMutated) {
        const nextServerRev = (Number(wsData.serverRevision) || 0) + 1;
        knownExistingPaths.add(wsRef.path);
        await writeSingleProtectedDoc(
          wsRef,
          wsPath,
          {
            workspaceId: WORKSPACE_ID,
            name: WORKSPACE_NAME,
            ownerUid: cleanStr(wsData.ownerUid || fbUser.uid, 128),
            status: 'active',
            allowSelfJoin: true
          },
          {
            serverRevision: nextServerRev,
            metaRevision: nextMetaRevision,
            materialsRevision: nextMaterialsRevision,
            materialsCount: nextMaterialsCount,
            materialsChunkCount: nextMaterialsChunkCount,
            materialsDigest: nextMaterialsDigest,
            metaDigest: nextMetaDigest,
            accountChunkCount: nextAccountChunkCount,
            warehouseChunkCount: nextWarehouseChunkCount,
            tombstoneChunkCount: nextTombstoneChunkCount,
            inboundIndexChunkCount: nextInboundIndexChunkCount,
            outboundIndexChunkCount: nextOutboundIndexChunkCount
          }
        );
        lastAppliedCloudServerRev = nextServerRev;
      } else {
        lastAppliedCloudServerRev = Number(wsData.serverRevision) || 0;
      }

      await StorageService.flush();
      emitCloudState({
        status: 'connected',
        lastSyncedAt: Date.now(),
        errorMessage: null
      });
      return { ok: true, pulledChanges };
    } catch (err) {
      console.warn('Cloud sync reconcile deferred:', err);
      return { ok: false, pulledChanges };
    } finally {
      isCloudReconciling = false;
      if (pendingCloudReconcile) {
        pendingCloudReconcile = false;
        void this.reconcileWithCloud();
      }
    }
  },

  // ==========================================================================
  // Cloud Single-Device Session Lock Operations
  // ==========================================================================
  async syncActiveSessionToCloudIfConnected(session: ActiveUserSession): Promise<void> {
    if (!isSessionStillValidLocally(session.sessionToken)) return;
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return;
    const ok = await ensureWorkspaceReady(fbUser);
    if (!ok || !isSessionStillValidLocally(session.sessionToken)) return;

    attachWorkspaceRealtimeListener();
    emitCloudState({
      status: 'connected',
      errorMessage: null
    });

    const userKey = canonicalUserSessionKey(session.userKey || session.username);
    const sessionDocId = makeSafeDocId('sess', userKey);
    const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
    const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
    const existingSnap = await safeGetDoc(sessRef, sessPath);
    if (!isSessionStillValidLocally(session.sessionToken)) return;

    const prev = existingSnap.exists() ? existingSnap.data() : null;
    const nowMs = Date.now();
    const prevToken = String(prev?.sessionToken || '');

    // Nếu đám mây đã ghi nhận đúng mã phiên này và nhịp tim còn rất mới thì không cần ghi lặp lại
    if (prevToken === session.sessionToken) {
      if (isSessionHeartbeatFresh(nowMs, Number(prev?.lastSeenAt) || 0, 20_000)) {
        this.watchActiveSession(userKey);
        return;
      }
    }

    // NẾU ĐÁM MÂY ĐANG CÓ MÃ PHIÊN KHÁC:
    // Kiểm tra xem phiên trên đám mây có mới hơn phiên này không.
    // NGUYÊN TẮC: Phiên cũ (thiết bị trước) phải thoát, phiên mới (thiết bị hiện tại vừa đăng nhập) được giữ lại!
    if (prev && prevToken && prevToken !== session.sessionToken) {
      const prevIssued = Number(prev.issuedAtMs) || 0;
      const myIssued = Number(session.issuedAtMs) || 0;
      const revokedBefore = Number(prev.revokedBeforeMs) || 0;
      // Chỉ kích hoạt đăng xuất thiết bị hiện tại nếu ĐÃ CÓ thiết bị khác phát hành phiên MỚI HƠN phiên này!
      if (
        (prev.deviceId !== session.deviceId && prevIssued > myIssued) ||
        (revokedBefore > 0 && myIssued <= revokedBefore)
      ) {
        externalOnRemoteSessionSnapshot?.(prev);
        return;
      }
      // Phiên hiện tại mới hơn hoặc bằng: ghi nhận thu hồi phiên cũ trên đám mây để thiết bị cũ bị ngắt
      rememberRevokedCloudToken(prevToken);
    }

    const monotonicIssued =
      prevToken === session.sessionToken
        ? Number(prev?.issuedAtMs) || Number(session.issuedAtMs) || nowMs
        : Math.max(
            Number(session.issuedAtMs) || nowMs,
            (Number(prev?.issuedAtMs) || 0) + 1,
            (Number(prev?.revokedBeforeMs) || 0) + 1
          );

    if (!isSessionStillValidLocally(session.sessionToken)) return;

    await writeSingleProtectedDoc(
      sessRef,
      sessPath,
      {
        workspaceId: WORKSPACE_ID,
        sessionDocId,
        userKey: cleanStr(userKey, 160, 'user')
      },
      {
        userId: cleanStr(session.userId, 160, 'user-0'),
        username: cleanStr(session.username, 160, 'user'),
        sessionToken: cleanStr(session.sessionToken, 200, ''),
        issuedAtMs: monotonicIssued,
        deviceId: cleanStr(session.deviceId, 160, ''),
        deviceLabel: cleanStr(session.deviceLabel, 200, 'Thiết bị Web'),
        loginAt: cleanStr(session.loginAt, 64, new Date(nowMs).toISOString()),
        lastSeenAt: nowMs,
        revokedBeforeMs: cleanNum(prev?.revokedBeforeMs, 0),
        forceLogoutDeviceLabel: cleanStr(prev?.forceLogoutDeviceLabel, 200, ''),
        forceLogoutAt: cleanStr(prev?.forceLogoutAt, 64, '')
      }
    );
    if (isSessionStillValidLocally(session.sessionToken)) {
      this.watchActiveSession(userKey);
    }
  },

  async loginWithCloud(
    username: string,
    password: string,
    deviceId: string,
    deviceLabel: string,
    forceLogoutOtherDevice: boolean
  ): Promise<{
    handled: boolean;
    success: boolean;
    conflict?: boolean;
    activeSession?: ActiveUserSession;
    user?: User;
    session?: ActiveUserSession;
    replacedSession?: ActiveUserSession;
    message: string;
  }> {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }

      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) {
        return { handled: false, success: false, message: '' };
      }

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) {
        return { handled: false, success: false, message: '' };
      }

      // Đồng bộ nhanh danh sách tài khoản mới nhất từ Cloud trước khi kiểm tra mật khẩu
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, `workspaces/${WORKSPACE_ID}`);
      if (wsSnap.exists()) {
        await pullMetaFromCloud(wsSnap.data() as WorkspaceManifestDoc, fbUser);
      }

      const users = StorageService.getUsers();
      const matched = findMatchingUser(users, username);

      if (!matched) {
        return {
          handled: true,
          success: false,
          message: `Tài khoản "${username}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại tên đăng nhập!`
        };
      }

      if (!matched.isActive) {
        return {
          handled: true,
          success: false,
          message: 'Tài khoản này hiện đang bị khóa hoặc ngừng kích hoạt. Vui lòng liên hệ Admin.'
        };
      }

      if (!isPasswordMatch(matched.password, password)) {
        return {
          handled: true,
          success: false,
          message: 'Mật khẩu đăng nhập không chính xác. Vui lòng kiểm tra lại.'
        };
      }

      const userKey = canonicalUserSessionKey(matched);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const sessSnap = await safeGetDoc(sessRef, sessPath);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      let prevActive: ActiveUserSession | undefined;
      let prevIssued = 0;
      let prevRevoked = Number(matched.sessionRevokedAt) || 0;

      if (sessSnap.exists()) {
        const d = sessSnap.data();
        prevIssued = Number(d.issuedAtMs) || 0;
        prevRevoked = Math.max(prevRevoked, Number(d.revokedBeforeMs) || 0);
        const existingToken = String(d.sessionToken || '');
        const hasToken = Boolean(existingToken) && !revokedCloudSessionTokens.has(existingToken);
        const isFresh = isSessionHeartbeatFresh(nowMs, Number(d.lastSeenAt) || 0, ACTIVE_SESSION_TTL_MS);
        if (hasToken && isFresh) {
          prevActive = {
            userId: String(d.userId || matched.id),
            username: String(d.username || matched.username),
            userKey,
            sessionToken: existingToken,
            issuedAtMs: prevIssued,
            deviceId: String(d.deviceId || ''),
            deviceLabel: String(d.deviceLabel || 'Thiết bị khác'),
            loginAt: String(d.loginAt || nowIso),
            lastSeenAt: Number(d.lastSeenAt) || nowMs
          };
        }
      }

      if (prevActive && prevActive.deviceId !== deviceId && !forceLogoutOtherDevice) {
        // Tự động thu hồi phiên cũ trên thiết bị khác để bảo đảm duy nhất 1 thiết bị hoạt động tại một thời điểm
        forceLogoutOtherDevice = true;
      }

      if (prevActive?.sessionToken) {
        rememberRevokedCloudToken(prevActive.sessionToken);
      }

      const monotonicIssued = Math.max(nowMs, prevIssued + 2, prevRevoked + 2);
      const newToken = `cloud.${monotonicIssued}.${Math.random().toString(36).slice(2, 12)}`;
      const nextRevokedBefore = forceLogoutOtherDevice ? monotonicIssued - 1 : prevRevoked;

      const newSession: ActiveUserSession = {
        userId: matched.id,
        username: matched.username,
        userKey,
        sessionToken: newToken,
        issuedAtMs: monotonicIssued,
        deviceId,
        deviceLabel,
        loginAt: nowIso,
        lastSeenAt: nowMs
      };

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: newToken,
          issuedAtMs: monotonicIssued,
          deviceId: cleanStr(deviceId, 160, ''),
          deviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị Web'),
          loginAt: nowIso,
          lastSeenAt: nowMs,
          revokedBeforeMs: cleanNum(nextRevokedBefore, 0),
          forceLogoutDeviceLabel: forceLogoutOtherDevice ? cleanStr(deviceLabel, 200, '') : '',
          forceLogoutAt: forceLogoutOtherDevice ? nowIso : ''
        }
      );

      const nextUserUpdatedAt = Math.max(nowMs, (Number(matched.updatedAt) || 0) + 1);
      const updatedFromStore =
        StorageService.updateUser(matched.id, {
          lastLogin: nowIso,
          sessionRevokedAt: forceLogoutOtherDevice
            ? Math.max(Number(matched.sessionRevokedAt) || 0, nextRevokedBefore)
            : matched.sessionRevokedAt,
          updatedAt: nextUserUpdatedAt
        }) || {
          ...matched,
          lastLogin: nowIso,
          updatedAt: nextUserUpdatedAt
        };

      emitCloudState({ status: 'connected', errorMessage: null });
      this.watchActiveSession(userKey);

      return {
        handled: true,
        success: true,
        user: updatedFromStore,
        session: newSession,
        replacedSession: prevActive && prevActive.deviceId !== deviceId ? prevActive : undefined,
        message: 'Đăng nhập & đồng bộ đám mây thành công!'
      };
    } catch (err) {
      console.warn('Cloud login unavailable, falling back to server authentication:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async loginWithGoogleIdentityOnCloud(
    fbUser: FirebaseUser,
    deviceId: string,
    deviceLabel: string,
    forceLogoutOtherDevice: boolean,
    timeoutMs = 12000
  ): Promise<{
    handled: boolean;
    success: boolean;
    conflict?: boolean;
    locked?: boolean;
    activeSession?: ActiveUserSession;
    user?: User;
    session?: ActiveUserSession;
    replacedSession?: ActiveUserSession;
    message: string;
  }> {
    if (isFirestoreCircuitOpen() || !fbUser || !fbUser.email || !fbUser.emailVerified) {
      return { handled: false, success: false, message: '' };
    }

    let timedOut = false;
    const effectiveTimeoutMs = Math.max(timeoutMs, 12000);

    const executeFastCloudLogin = async (): Promise<{
      handled: boolean;
      success: boolean;
      conflict?: boolean;
      locked?: boolean;
      activeSession?: ActiveUserSession;
      user?: User;
      session?: ActiveUserSession;
      replacedSession?: ActiveUserSession;
      message: string;
    }> => {
      interactiveAuthInFlight = true;
      try {
        const ok = await ensureWorkspaceReady(fbUser);
        if (!ok || !fbUser.email) {
          return { handled: false, success: false, message: '' };
        }

        attachWorkspaceRealtimeListener();
        emitCloudState({ status: 'connected', errorMessage: null });

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        const emailLower = fbUser.email.trim().toLowerCase();
        const emailDigest = computeEmailAuthDigest(emailLower);
        let localUsers = StorageService.getUsers();
        const alreadyKnownLocally =
          emailLower === BOOTSTRAPPED_ADMIN_EMAIL ||
          localUsers.some(
            (u) =>
              !String(u.id || '').startsWith('user-g-') &&
              ((u.email && u.email.trim().toLowerCase() === emailLower) ||
                (emailDigest && u.emailDigest === emailDigest))
          );

        // Tải danh sách tài khoản đã được Admin khai báo trên Cloud (accounts_0..N) nếu máy cục bộ chưa có bản ghi khai báo
        if (!alreadyKnownLocally) {
          const chunkTotal = Math.max(1, Number(cachedWsManifest?.data?.accountChunkCount) || 1);
          const accSnaps = await Promise.all(
            Array.from({ length: chunkTotal }, (_, idx) => {
              const cid = `accounts_${idx}`;
              return safeGetDoc(
                doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
                `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`
              );
            })
          );
          const remoteUsers: User[] = [];
          for (const snap of accSnaps) {
            if (!snap.exists()) continue;
            const rawItems = Array.isArray(snap.data().items) ? snap.data().items : [];
            for (const raw of rawItems) {
              if (raw && typeof raw === 'object') {
                remoteUsers.push(deserializeAccountPublic(raw));
              }
            }
          }
          if (remoteUsers.length > 0) {
            StorageService.applyRemoteMeta({ users: remoteUsers });
            localUsers = StorageService.getUsers();
          }
        }

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const resolved = resolveGoogleUserRecord(localUsers, {
          email: emailLower,
          displayName: fbUser.displayName,
          uid: fbUser.uid,
          nowMs
        });

        if (!resolved.allowed) {
          return {
            handled: true,
            success: false,
            locked: true,
            user: resolved.user,
            message:
              resolved.message ||
              'Tài khoản Google này hiện đang bị khóa hoặc ngừng kích hoạt bởi Quản trị viên.'
          };
        }

        let matched = resolved.user;
        if (resolved.isNew || resolved.mutated) {
          matched = StorageService.upsertGoogleUser(matched);
          cloudMetaDirty = true;
        }

        const userKey = canonicalUserSessionKey(matched);
        const sessionDocId = makeSafeDocId('sess', userKey);
        const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
        const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
        const sessSnap = await safeGetDoc(sessRef, sessPath);

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        let prevActive: ActiveUserSession | undefined;
        let prevIssued = 0;
        let prevRevoked = Number(matched.sessionRevokedAt) || 0;

        if (sessSnap.exists()) {
          const d = sessSnap.data();
          prevIssued = Number(d.issuedAtMs) || 0;
          prevRevoked = Math.max(prevRevoked, Number(d.revokedBeforeMs) || 0);
          const existingToken = String(d.sessionToken || '');
          const hasToken = Boolean(existingToken) && !revokedCloudSessionTokens.has(existingToken);
          const isFresh = isSessionHeartbeatFresh(
            nowMs,
            Number(d.lastSeenAt) || 0,
            ACTIVE_SESSION_TTL_MS
          );
          if (hasToken && isFresh) {
            prevActive = {
              userId: String(d.userId || matched.id),
              username: String(d.username || matched.username),
              userKey,
              sessionToken: existingToken,
              issuedAtMs: prevIssued,
              deviceId: String(d.deviceId || ''),
              deviceLabel: String(d.deviceLabel || 'Thiết bị khác'),
              loginAt: String(d.loginAt || nowIso),
              lastSeenAt: Number(d.lastSeenAt) || nowMs
            };
          }
        }

        if (prevActive && prevActive.deviceId !== deviceId && !forceLogoutOtherDevice) {
          // Tự động thu hồi phiên cũ trên thiết bị khác để bảo đảm duy nhất 1 thiết bị hoạt động per user account
          forceLogoutOtherDevice = true;
        }

        if (timedOut) {
          return { handled: false, success: false, message: '' };
        }

        if (prevActive?.sessionToken) {
          rememberRevokedCloudToken(prevActive.sessionToken);
        }

        const monotonicIssued = Math.max(nowMs, prevIssued + 2, prevRevoked + 2);
        const newToken = `cloud.${monotonicIssued}.${Math.random().toString(36).slice(2, 12)}`;
        const nextRevokedBefore = forceLogoutOtherDevice ? monotonicIssued - 1 : prevRevoked;

        const newSession: ActiveUserSession = {
          userId: matched.id,
          username: matched.username,
          userKey,
          sessionToken: newToken,
          issuedAtMs: monotonicIssued,
          deviceId,
          deviceLabel,
          loginAt: nowIso,
          lastSeenAt: nowMs
        };

        const sessionMutablePayload = {
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: newToken,
          issuedAtMs: monotonicIssued,
          deviceId: cleanStr(deviceId, 160, ''),
          deviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị Web'),
          loginAt: nowIso,
          lastSeenAt: nowMs,
          revokedBeforeMs: cleanNum(nextRevokedBefore, 0),
          forceLogoutDeviceLabel: forceLogoutOtherDevice ? cleanStr(deviceLabel, 200, '') : '',
          forceLogoutAt: forceLogoutOtherDevice ? nowIso : '',
          updatedByUid: fbUser.uid,
          updatedAt: serverTimestamp()
        };

        if (sessSnap.exists()) {
          try {
            await updateDoc(sessRef, sessionMutablePayload);
          } catch {
            await setDoc(sessRef, {
              workspaceId: WORKSPACE_ID,
              sessionDocId,
              userKey: cleanStr(userKey, 160, 'user'),
              ...sessionMutablePayload,
              createdAt: sessSnap.data()?.createdAt || serverTimestamp()
            });
          }
        } else {
          await setDoc(sessRef, {
            workspaceId: WORKSPACE_ID,
            sessionDocId,
            userKey: cleanStr(userKey, 160, 'user'),
            ...sessionMutablePayload,
            createdAt: serverTimestamp()
          });
          knownExistingPaths.add(sessRef.path);
        }

        const nextUserUpdatedAt = Math.max(nowMs, (Number(matched.updatedAt) || 0) + 1);
        const updatedFromStore =
          StorageService.updateUser(matched.id, {
            email: emailLower,
            lastLogin: nowIso,
            sessionRevokedAt: forceLogoutOtherDevice
              ? Math.max(Number(matched.sessionRevokedAt) || 0, nextRevokedBefore)
              : matched.sessionRevokedAt,
            updatedAt: nextUserUpdatedAt
          }) || {
            ...matched,
            email: emailLower,
            lastLogin: nowIso,
            updatedAt: nextUserUpdatedAt
          };

        cloudMetaDirty = true;
        attachWorkspaceRealtimeListener();
        emitCloudState({ status: 'connected', errorMessage: null });
        this.watchActiveSession(userKey);

        return {
          handled: true,
          success: true,
          user: updatedFromStore,
          session: newSession,
          replacedSession: prevActive && prevActive.deviceId !== deviceId ? prevActive : undefined,
          message: `Đăng nhập thành công với ${emailLower}!`
        };
      } catch (err) {
        console.warn('Cloud Google identity login deferred to server fallback:', err);
        return { handled: false, success: false, message: '' };
      } finally {
        interactiveAuthInFlight = false;
      }
    };

    return Promise.race([
      executeFastCloudLogin(),
      new Promise<{
        handled: boolean;
        success: boolean;
        message: string;
      }>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve({ handled: false, success: false, message: '' });
        }, effectiveTimeoutMs)
      )
    ]);
  },

  async requestLogoutOtherDeviceByGoogleWithCloud(
    fbUser: FirebaseUser,
    deviceLabel: string
  ): Promise<{ handled: boolean; success: boolean; message: string }> {
    try {
      if (!fbUser || !fbUser.email || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }
      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) return { handled: false, success: false, message: '' };

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { handled: false, success: false, message: '' };

      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, `workspaces/${WORKSPACE_ID}`);
      if (wsSnap.exists()) {
        await pullMetaFromCloud(wsSnap.data() as WorkspaceManifestDoc, fbUser);
      }

      const resolved = resolveGoogleUserRecord(StorageService.getUsers(), {
        email: fbUser.email,
        displayName: fbUser.displayName,
        uid: fbUser.uid
      });
      if (!resolved.allowed) {
        return {
          handled: true,
          success: false,
          message: resolved.message || 'Tài khoản Google này đang bị khóa.'
        };
      }

      const matched = resolved.user;
      const userKey = canonicalUserSessionKey(matched);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const prevSnap = await safeGetDoc(sessRef, sessPath);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      if (prev?.sessionToken) {
        rememberRevokedCloudToken(String(prev.sessionToken));
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const revokeMark = Math.max(
        nowMs,
        Number(matched.sessionRevokedAt) || 0,
        Number(prev?.issuedAtMs) || 0,
        Number(prev?.revokedBeforeMs) || 0
      );

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: '',
          issuedAtMs: revokeMark,
          deviceId: '',
          deviceLabel: '',
          loginAt: '',
          lastSeenAt: 0,
          revokedBeforeMs: revokeMark,
          forceLogoutDeviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị khác'),
          forceLogoutAt: nowIso
        }
      );

      if (!resolved.isNew) {
        StorageService.updateUser(matched.id, { sessionRevokedAt: revokeMark });
      }
      void this.reconcileWithCloud();

      return {
        handled: true,
        success: true,
        message: 'Đã đăng xuất phiên trên thiết bị kia thành công! Bạn có thể tiếp tục đăng nhập ngay.'
      };
    } catch (err) {
      console.warn('Cloud Google remote logout fallback to server:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async verifySessionWithCloud(mySession: ActiveUserSession): Promise<{
    handled: boolean;
    valid: boolean;
    reason?: 'replaced' | 'disabled' | 'force_logout';
    replacedBy?: ActiveUserSession;
    forceLogoutBy?: { deviceLabel?: string; at?: string };
  }> {
    try {
      if (!isSessionStillValidLocally(mySession.sessionToken)) {
        return { handled: false, valid: true };
      }
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified || isFirestoreCircuitOpen()) {
        return { handled: false, valid: true };
      }

      const users = StorageService.getUsers();
      const matched = users.find(
        (u) => normUserKey(u.username) === normUserKey(mySession.userKey) || u.id === mySession.userId
      );
      if (matched && !matched.isActive) {
        return { handled: true, valid: false, reason: 'disabled' };
      }

      const userKey =
        canonicalUserSessionKey({ username: mySession.username, email: matched?.email }) ||
        canonicalUserSessionKey(mySession.userKey);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const snap = await safeGetDoc(sessRef, sessPath);
      if (!isSessionStillValidLocally(mySession.sessionToken)) {
        return { handled: false, valid: true };
      }

      if (!snap.exists()) {
        await this.syncActiveSessionToCloudIfConnected(mySession);
        return { handled: true, valid: true };
      }

      const d = snap.data();
      const remoteToken = String(d.sessionToken || '');
      const remoteIssued = Number(d.issuedAtMs) || 0;
      const revokedBefore = Number(d.revokedBeforeMs) || 0;
      const myIssued = Number(mySession.issuedAtMs) || 0;

      if (remoteToken === mySession.sessionToken) {
        // Gia hạn nhịp tim nếu đã quá 20 giây (hoặc lệch đồng hồ giữa các thiết bị) để tiết kiệm hạn mức ghi Firestore
        const nowMs = Date.now();
        if (Math.abs(nowMs - (Number(d.lastSeenAt) || 0)) >= 20_000 && isSessionStillValidLocally(mySession.sessionToken)) {
          await writeSingleProtectedDoc(
            sessRef,
            sessPath,
            {
              workspaceId: WORKSPACE_ID,
              sessionDocId,
              userKey: cleanStr(userKey, 160, 'user')
            },
            {
              userId: cleanStr(d.userId || mySession.userId, 160, 'user-0'),
              username: cleanStr(d.username || mySession.username, 160, 'user'),
              sessionToken: remoteToken,
              issuedAtMs: remoteIssued || myIssued || nowMs,
              deviceId: cleanStr(mySession.deviceId, 160, ''),
              deviceLabel: cleanStr(mySession.deviceLabel, 200, 'Thiết bị Web'),
              loginAt: cleanStr(d.loginAt || mySession.loginAt, 64, ''),
              lastSeenAt: nowMs,
              revokedBeforeMs: cleanNum(revokedBefore, 0),
              forceLogoutDeviceLabel: cleanStr(d.forceLogoutDeviceLabel, 200, ''),
              forceLogoutAt: cleanStr(d.forceLogoutAt, 64, '')
            }
          );
        }
        return { handled: true, valid: true };
      }

      if (!remoteToken) {
        if (revokedBefore > 0 && myIssued > 0 && myIssued <= revokedBefore) {
          return {
            handled: true,
            valid: false,
            reason: 'force_logout',
            forceLogoutBy: {
              deviceLabel: String(d.forceLogoutDeviceLabel || ''),
              at: String(d.forceLogoutAt || '')
            }
          };
        }
        // Phiên địa phương mới đăng nhập trước khi kết nối đám mây -> ghi nhận lên đám mây
        await this.syncActiveSessionToCloudIfConnected(mySession);
        return { handled: true, valid: true };
      }

      if (
        remoteToken &&
        (d.deviceId !== mySession.deviceId || remoteIssued >= myIssued - 5000) &&
        !revokedCloudSessionTokens.has(remoteToken)
      ) {
        return {
          handled: true,
          valid: false,
          reason: 'replaced',
          replacedBy: {
            userId: String(d.userId || mySession.userId),
            username: String(d.username || mySession.username),
            userKey,
            sessionToken: remoteToken,
            issuedAtMs: remoteIssued,
            deviceId: String(d.deviceId || ''),
            deviceLabel: String(d.deviceLabel || 'Thiết bị khác'),
            loginAt: String(d.loginAt || ''),
            lastSeenAt: Number(d.lastSeenAt) || Date.now()
          }
        };
      }

      // Phiên địa phương mới hơn phiên cũ trên đám mây -> nâng cấp đám mây
      await this.syncActiveSessionToCloudIfConnected(mySession);
      return { handled: true, valid: true };
    } catch {
      return { handled: false, valid: true };
    }
  },

  async requestLogoutOtherDeviceWithCloud(
    username: string,
    password: string,
    deviceLabel: string
  ): Promise<{ handled: boolean; success: boolean; message: string }> {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }

      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) return { handled: false, success: false, message: '' };

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { handled: false, success: false, message: '' };

      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, `workspaces/${WORKSPACE_ID}`);
      if (wsSnap.exists()) {
        await pullMetaFromCloud(wsSnap.data() as WorkspaceManifestDoc, fbUser);
      }

      const matched = findMatchingUser(StorageService.getUsers(), username);
      if (!matched) {
        return {
          handled: true,
          success: false,
          message: `Tài khoản "${username}" không tồn tại trong hệ thống.`
        };
      }
      if (!isPasswordMatch(matched.password, password)) {
        return {
          handled: true,
          success: false,
          message: 'Mật khẩu xác thực không chính xác.'
        };
      }

      const userKey = canonicalUserSessionKey(matched);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const prevSnap = await safeGetDoc(sessRef, sessPath);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      if (prev?.sessionToken) {
        rememberRevokedCloudToken(String(prev.sessionToken));
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const revokeMark = Math.max(
        nowMs,
        Number(matched.sessionRevokedAt) || 0,
        Number(prev?.issuedAtMs) || 0,
        Number(prev?.revokedBeforeMs) || 0
      );

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(matched.id, 160, 'user-0'),
          username: cleanStr(matched.username, 160, 'user'),
          sessionToken: '',
          issuedAtMs: revokeMark,
          deviceId: '',
          deviceLabel: '',
          loginAt: '',
          lastSeenAt: 0,
          revokedBeforeMs: revokeMark,
          forceLogoutDeviceLabel: cleanStr(deviceLabel, 200, 'Thiết bị khác'),
          forceLogoutAt: nowIso
        }
      );

      StorageService.updateUser(matched.id, { sessionRevokedAt: revokeMark });
      void this.reconcileWithCloud();

      return {
        handled: true,
        success: true,
        message: 'Đã gửi yêu cầu đăng xuất trên thiết bị kia qua Đám mây thành công! Bạn có thể đăng nhập ngay.'
      };
    } catch (err) {
      console.warn('Cloud remote logout fallback to server:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async forceLogoutOthersKeepCurrentWithCloud(
    current: { user: User; session: ActiveUserSession }
  ): Promise<{ handled: boolean; success: boolean; session?: ActiveUserSession; message: string }> {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) {
        return { handled: false, success: false, message: '' };
      }

      const tokenOk = await ensureValidFirebaseAuthToken(fbUser);
      if (!tokenOk) return { handled: false, success: false, message: '' };

      const ok = await ensureWorkspaceReady(fbUser);
      if (!ok) return { handled: false, success: false, message: '' };

      const userKey =
        canonicalUserSessionKey(current.user) || canonicalUserSessionKey(current.session.userKey);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const prevSnap = await safeGetDoc(sessRef, sessPath);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const revokeMark = Math.max(
        nowMs,
        Number(current.session.issuedAtMs) || 0,
        Number(prev?.issuedAtMs) || 0,
        Number(prev?.revokedBeforeMs) || 0
      );
      const nextIssued = revokeMark + 1;
      const nextToken = `cloud.${nextIssued}.${Math.random().toString(36).slice(2, 12)}`;
      rememberRevokedCloudToken(current.session.sessionToken);

      const refreshedSession: ActiveUserSession = {
        ...current.session,
        sessionToken: nextToken,
        issuedAtMs: nextIssued,
        lastSeenAt: nowMs
      };

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(current.user.id, 160, 'user-0'),
          username: cleanStr(current.user.username, 160, 'user'),
          sessionToken: nextToken,
          issuedAtMs: nextIssued,
          deviceId: cleanStr(current.session.deviceId, 160, ''),
          deviceLabel: cleanStr(current.session.deviceLabel, 200, 'Thiết bị Web'),
          loginAt: cleanStr(current.session.loginAt, 64, nowIso),
          lastSeenAt: nowMs,
          revokedBeforeMs: revokeMark,
          forceLogoutDeviceLabel: cleanStr(current.session.deviceLabel, 200, 'Thiết bị hiện tại'),
          forceLogoutAt: nowIso
        }
      );

      StorageService.updateUser(current.user.id, { sessionRevokedAt: revokeMark });
      void this.reconcileWithCloud();

      return {
        handled: true,
        success: true,
        session: refreshedSession,
        message: 'Đã đăng xuất mọi phiên trên thiết bị khác qua Đám mây thành công!'
      };
    } catch (err) {
      console.warn('Cloud force-logout-keep-current fallback to server:', err);
      return { handled: false, success: false, message: '' };
    }
  },

  async logoutFromCloud(mySession: ActiveUserSession): Promise<void> {
    rememberRevokedCloudToken(mySession.sessionToken);
    this.watchActiveSession(null);
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return;

    try {
      const userKey = canonicalUserSessionKey(mySession.userKey || mySession.username);
      const sessionDocId = makeSafeDocId('sess', userKey);
      const sessPath = `workspaces/${WORKSPACE_ID}/sessions/${sessionDocId}`;
      const sessRef = doc(db, 'workspaces', WORKSPACE_ID, 'sessions', sessionDocId);
      const snap = await safeGetDoc(sessRef, sessPath);
      if (!snap.exists()) return;
      const d = snap.data();
      // Chỉ giải phóng khóa nếu đúng mã phiên của thiết bị này đang giữ khóa (không bao giờ xóa nhầm phiên mới vừa đăng nhập lại)
      if (String(d.sessionToken || '') !== mySession.sessionToken) return;

      await writeSingleProtectedDoc(
        sessRef,
        sessPath,
        {
          workspaceId: WORKSPACE_ID,
          sessionDocId,
          userKey: cleanStr(userKey, 160, 'user')
        },
        {
          userId: cleanStr(d.userId || mySession.userId, 160, 'user-0'),
          username: cleanStr(d.username || mySession.username, 160, 'user'),
          sessionToken: '',
          issuedAtMs: cleanNum(d.issuedAtMs, 0),
          deviceId: '',
          deviceLabel: '',
          loginAt: '',
          lastSeenAt: 0,
          revokedBeforeMs: cleanNum(d.revokedBeforeMs, 0),
          forceLogoutDeviceLabel: cleanStr(d.forceLogoutDeviceLabel, 200, ''),
          forceLogoutAt: cleanStr(d.forceLogoutAt, 64, '')
        }
      );
    } catch {
      // ignore network error during logout
    }
  },

  async pushOsdRealtimeToCloud(): Promise<boolean> {
    if (isFirestoreCircuitOpen() || interactiveAuthInFlight) return false;
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return false;
    const ok = await ensureWorkspaceReady(fbUser);
    if (!ok) return false;

    try {
      const osdList = StorageService.getOsdReceipts();
      const tombstones = StorageService.getTombstones();
      const users = StorageService.getUsers();
      const warehouses = StorageService.getWarehouses();

      const staged: StagedDocWrite[] = [];

      const osdChunks = chunkArray(osdList.map(serializeOsdPublic), CLOUD_CHUNK_SIZE);
      const effectiveOsdChunks = osdChunks.length > 0 ? osdChunks : [[]];
      for (let i = 0; i < effectiveOsdChunks.length; i++) {
        const cid = `osd_${i}`;
        staged.push({
          ref: doc(db, 'workspaces', WORKSPACE_ID, 'metaChunks', cid),
          pathLabel: `workspaces/${WORKSPACE_ID}/metaChunks/${cid}`,
          immutableCreateFields: {
            workspaceId: WORKSPACE_ID,
            chunkType: 'osd',
            chunkIndex: i
          },
          mutableFields: {
            items: effectiveOsdChunks[i]
          }
        });
      }

      // Đẩy tombstones để các client khác nhận diện ngay vật tư OSD đã bị xóa
      const flatTombItems: Array<{ bucket: string; key: string; deletedAtMs: number }> = [];
      const buckets: Array<keyof TombstoneMap> = ['inbound', 'outbound', 'materials', 'warehouses', 'users', 'osd'];
      for (const b of buckets) {
        const map = tombstones[b] || {};
        for (const [k, ts] of Object.entries(map)) {
          const numTs = Number(ts) || 0;
          if (k && numTs > 0) {
            flatTombItems.push({
              bucket: b,
              key: cleanStr(k, 160, 'k'),
              deletedAtMs: cleanNum(numTs, 1)
            });
          }
        }
      }

      const tombChunks = chunkArray(flatTombItems, CLOUD_CHUNK_SIZE);
      for (let i = 0; i < tombChunks.length; i++) {
        const cid = `tomb_${i}`;
        staged.push({
          ref: doc(db, 'workspaces', WORKSPACE_ID, 'tombstoneChunks', cid),
          pathLabel: `workspaces/${WORKSPACE_ID}/tombstoneChunks/${cid}`,
          immutableCreateFields: {
            workspaceId: WORKSPACE_ID,
            chunkIndex: i
          },
          mutableFields: {
            items: tombChunks[i]
          }
        });
      }

      await commitStagedWrites(staged);
      cloudMetaDirty = false;

      for (const o of osdList) {
        if (o.pdfAttachment?.dataUrl && o.pdfAttachment.dataUrl.length > 50) {
          void pushSingleOsdAttachment(o.id, o.pdfAttachment).catch(() => {});
        }
      }

      // Cập nhật WorkspaceManifest với serverRevision và metaRevision mới để kích hoạt realtime trên mọi thiết bị
      const wsPath = `workspaces/${WORKSPACE_ID}`;
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await safeGetDoc(wsRef, wsPath);
      if (wsSnap.exists()) {
        const wsData = wsSnap.data() as WorkspaceManifestDoc;
        const nextServerRev = (Number(wsData.serverRevision) || 0) + 1;
        const nextMetaRevision = (Number(wsData.metaRevision) || 0) + 1;
        const nextMetaDigest = cleanStr(
          computeCloudSharedMetaDigest(users, warehouses, tombstones),
          128,
          '0.0.0:0:0:0'
        );

        knownExistingPaths.add(wsRef.path);
        await writeSingleProtectedDoc(
          wsRef,
          wsPath,
          {
            workspaceId: WORKSPACE_ID,
            name: WORKSPACE_NAME,
            ownerUid: cleanStr(wsData.ownerUid || fbUser.uid, 128),
            status: 'active',
            allowSelfJoin: true
          },
          {
            serverRevision: nextServerRev,
            metaRevision: nextMetaRevision,
            materialsRevision: Number(wsData.materialsRevision) || 0,
            materialsCount: Number(wsData.materialsCount) || 0,
            materialsChunkCount: Number(wsData.materialsChunkCount) || 0,
            materialsDigest: String(wsData.materialsDigest || '0:0:0:0'),
            metaDigest: nextMetaDigest,
            accountChunkCount: Number(wsData.accountChunkCount) || 0,
            warehouseChunkCount: Number(wsData.warehouseChunkCount) || 0,
            tombstoneChunkCount: tombChunks.length,
            inboundIndexChunkCount: Number(wsData.inboundIndexChunkCount) || 0,
            outboundIndexChunkCount: Number(wsData.outboundIndexChunkCount) || 0
          }
        );
        lastAppliedCloudServerRev = nextServerRev;
        lastAppliedCloudMetaRev = nextMetaRevision;
      }

      emitCloudState({
        status: 'connected',
        lastSyncedAt: Date.now(),
        errorMessage: null
      });

      return true;
    } catch (err) {
      console.warn('pushOsdRealtimeToCloud failed:', err);
      return false;
    }
  },

  getOsdPdfAttachment(osdId: string): Promise<string | null> {
    return getOsdPdfAttachment(osdId);
  },

  pushSingleOsdAttachment(osdId: string, pdf: OsdPdfAttachment): Promise<void> {
    return pushSingleOsdAttachment(osdId, pdf);
  }
};
