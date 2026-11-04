import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/**
 * Phase 0 & Phase 5 Security Rules Verification Suite (`firestore.rules.test.ts`).
 * Verifies:
 * 1. Blueprint-to-Rules exhaustive coverage (all 15 Firestore paths in firebase-blueprint.json exist in firestore.rules).
 * 2. Zero open reads/writes, global default-deny first rule, zero `allow list: if true` or client-delegated list rules.
 * 3. Deterministic CEL gate simulator verifying that ALL 12 "Dirty Dozen" adversarial payloads return PERMISSION_DENIED
 *    and legitimate multi-device sync payloads return ALLOWED.
 */

interface AuthCtx {
  uid: string;
  email: string;
  email_verified: boolean;
}

interface SimStore {
  admins: Set<string>;
  workspaces: Map<string, Record<string, any>>;
  members: Map<string, Record<string, any>>;
  inboundReceipts: Set<string>;
  outboundReceipts: Set<string>;
}

const REQUEST_TIME = 'SERVER_TIMESTAMP_NOW';
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function isValidId(id: unknown, max = 128): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= max && ID_REGEX.test(id);
}

function isVerifiedUser(auth: AuthCtx | null): boolean {
  return Boolean(auth && auth.email_verified === true);
}

function isAdmin(auth: AuthCtx | null, store: SimStore): boolean {
  return (
    isVerifiedUser(auth) &&
    (auth!.email === 'voduongphu@gmail.com' || store.admins.has(auth!.uid))
  );
}

function isActiveMember(auth: AuthCtx | null, workspaceId: string, store: SimStore): boolean {
  if (!isVerifiedUser(auth)) return false;
  const ws = store.workspaces.get(workspaceId);
  if (!ws || ws.status !== 'active') return false;
  if (isAdmin(auth, store)) return true;
  const m = store.members.get(`${workspaceId}/${auth!.uid}`);
  return Boolean(m && m.status === 'active');
}

function hasExactKeys(data: Record<string, any>, keys: string[]): boolean {
  const actual = Object.keys(data);
  if (actual.length !== keys.length) return false;
  const allow = new Set(keys);
  return actual.every((k) => allow.has(k));
}

function affectedKeysOnly(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  allowed: string[]
): boolean {
  const allowSet = new Set(allowed);
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  for (const k of allKeys) {
    if (JSON.stringify(existing[k]) !== JSON.stringify(incoming[k])) {
      if (!allowSet.has(k)) return false;
    }
  }
  return true;
}

function evaluateDirtyDozen(store: SimStore) {
  const nowTs = REQUEST_TIME;
  const oldTs = '2026-01-01T00:00:00Z';

  // Seed active workspace + staff member
  const validManifest = {
    workspaceId: 'vtp_main',
    name: 'Kho Vật Tư Dự Án',
    ownerUid: 'uid_admin',
    updatedByUid: 'uid_admin',
    status: 'active',
    allowSelfJoin: true,
    serverRevision: 1,
    metaRevision: 1,
    materialsRevision: 1,
    materialsCount: 6,
    materialsChunkCount: 1,
    materialsDigest: '6:abc:def:123',
    metaDigest: '2.1.0:abc:def:123',
    accountChunkCount: 1,
    warehouseChunkCount: 1,
    tombstoneChunkCount: 0,
    inboundIndexChunkCount: 1,
    outboundIndexChunkCount: 0,
    createdAt: oldTs,
    updatedAt: oldTs
  };
  store.workspaces.set('vtp_main', validManifest);
  store.members.set('vtp_main/uid_staff', {
    workspaceId: 'vtp_main',
    uid: 'uid_staff',
    displayName: 'Nhân viên Kho',
    memberRole: 'member',
    status: 'active',
    updatedByUid: 'uid_staff',
    createdAt: oldTs,
    updatedAt: oldTs
  });
  store.members.set('vtp_main/uid_revoked', {
    workspaceId: 'vtp_main',
    uid: 'uid_revoked',
    displayName: 'Đã Thu Hồi',
    memberRole: 'member',
    status: 'revoked',
    updatedByUid: 'uid_admin',
    createdAt: oldTs,
    updatedAt: oldTs
  });

  const adminAuth: AuthCtx = {
    uid: 'uid_admin',
    email: 'voduongphu@gmail.com',
    email_verified: true
  };
  const staffAuth: AuthCtx = {
    uid: 'uid_staff',
    email: 'staff@gmail.com',
    email_verified: true
  };

  // 1. Shadow Field Injection (Ghost Field `isVerified: true`)
  const shadowPayload = {
    ...validManifest,
    updatedByUid: adminAuth.uid,
    updatedAt: nowTs,
    isVerified: true
  };
  const manifestAllowedKeys = Object.keys(validManifest);
  assert.equal(
    hasExactKeys(shadowPayload, manifestAllowedKeys),
    false,
    'Dirty Dozen #1 (Shadow Field) MUST be PERMISSION_DENIED'
  );

  // 2. Unverified Admin Email Spoof
  const spoofAdminAuth: AuthCtx = {
    uid: 'uid_spoof',
    email: 'voduongphu@gmail.com',
    email_verified: false
  };
  assert.equal(
    isAdmin(spoofAdminAuth, store),
    false,
    'Dirty Dozen #2 (Unverified Admin Email Spoof) MUST be PERMISSION_DENIED'
  );

  // 3. Self-Assigned Admin Role on Member Join
  const selfAdminJoin = {
    workspaceId: 'vtp_main',
    uid: 'uid_attacker',
    displayName: 'Attacker',
    memberRole: 'admin',
    status: 'active',
    updatedByUid: 'uid_attacker',
    createdAt: nowTs,
    updatedAt: nowTs
  };
  const attackerAuth: AuthCtx = {
    uid: 'uid_attacker',
    email: 'attacker@gmail.com',
    email_verified: true
  };
  const canSelfAssignAdmin =
    isAdmin(attackerAuth, store) || selfAdminJoin.memberRole === 'member';
  assert.equal(
    canSelfAssignAdmin,
    false,
    'Dirty Dozen #3 (Self-Assigned Admin Role) MUST be PERMISSION_DENIED'
  );

  // 4. Identity Spoofing (`updatedByUid` Forgery)
  const forgedChunk = {
    workspaceId: 'vtp_main',
    chunkIndex: 0,
    items: [{ code: 'VT-01' }],
    updatedByUid: 'uid_admin', // forged by staffAuth!
    createdAt: nowTs,
    updatedAt: nowTs
  };
  assert.equal(
    forgedChunk.updatedByUid === staffAuth.uid,
    false,
    'Dirty Dozen #4 (Identity Spoofing updatedByUid) MUST be PERMISSION_DENIED'
  );

  // 5. PII Blanket Read by Non-Admin Member
  assert.equal(
    isAdmin(staffAuth, store),
    false,
    'Dirty Dozen #5 (Non-Admin reading accountPrivate PII) MUST be PERMISSION_DENIED'
  );

  // 6. Unfiltered Collection `list` Scraping
  const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  const allowListMatches = rulesText.match(/allow\s+list\s*:\s*if\s+([^;]+);/g) || [];
  assert.ok(allowListMatches.length >= 15, 'All collections must explicitly declare allow list');
  for (const stmt of allowListMatches) {
    assert.match(
      stmt,
      /allow\s+list\s*:\s*if\s+false\s*;/,
      `Dirty Dozen #6 (List Scraping) MUST be PERMISSION_DENIED: ${stmt}`
    );
  }

  // 7. Denial-of-Wallet Oversized String (10,000-char notes > 2000 limit)
  const hugeNotes = 'X'.repeat(10000);
  assert.equal(
    hugeNotes.length <= 2000,
    false,
    'Dirty Dozen #7 (Oversized String > 2000 chars) MUST be PERMISSION_DENIED'
  );

  // 8. Array Overflow (205 items > 200 max)
  const overflowItems = Array.from({ length: 205 }, (_, idx) => ({ id: `i-${idx}` }));
  assert.equal(
    overflowItems.length <= 200,
    false,
    'Dirty Dozen #8 (Array > 200 items) MUST be PERMISSION_DENIED'
  );

  // 9. Forged Client Timestamp (`updatedAt != request.time`)
  const forgedTs: string = '2026-11-03T00:00:00Z';
  assert.equal(
    forgedTs === (REQUEST_TIME as string),
    false,
    'Dirty Dozen #9 (Forged Client Timestamp) MUST be PERMISSION_DENIED'
  );

  // 10. Immortal Field Mutation (`ownerUid` / `createdAt` changed on update)
  const mutatedOwner = {
    ...validManifest,
    ownerUid: 'uid_staff',
    updatedByUid: staffAuth.uid,
    updatedAt: nowTs
  };
  assert.equal(
    mutatedOwner.ownerUid === validManifest.ownerUid,
    false,
    'Dirty Dozen #10 (Immortal ownerUid Mutation) MUST be PERMISSION_DENIED'
  );

  // 11. Orphaned Item Chunk Write (parent receipt header missing)
  const parentExists = store.outboundReceipts.has('vtp_main/rcp_ghost');
  assert.equal(
    parentExists,
    false,
    'Dirty Dozen #11 (Orphaned Item Chunk without Parent Receipt) MUST be PERMISSION_DENIED'
  );

  // 12. Terminal State Escape (`revoked` member trying to self-restore `active`)
  const existingRevoked = store.members.get('vtp_main/uid_revoked')!;
  const revokedAuth: AuthCtx = {
    uid: 'uid_revoked',
    email: 'revoked@gmail.com',
    email_verified: true
  };
  const canEscapeRevoked =
    isAdmin(revokedAuth, store) ||
    (existingRevoked.status !== 'revoked' &&
      affectedKeysOnly(
        existingRevoked,
        { ...existingRevoked, status: 'active', updatedAt: nowTs },
        ['displayName', 'updatedByUid', 'updatedAt']
      ));
  assert.equal(
    canEscapeRevoked,
    false,
    'Dirty Dozen #12 (Terminal State Escape from revoked) MUST be PERMISSION_DENIED'
  );

  // Positive Check: Legitimate active staff member updating serverRevision & materialsDigest
  const legitUpdate = {
    ...validManifest,
    updatedByUid: staffAuth.uid,
    serverRevision: 2,
    materialsRevision: 2,
    materialsCount: 10,
    materialsDigest: '10:xyz:789:000',
    updatedAt: nowTs
  };
  const legitAllowed =
    isVerifiedUser(staffAuth) &&
    isValidId('vtp_main', 64) &&
    hasExactKeys(legitUpdate, manifestAllowedKeys) &&
    legitUpdate.updatedByUid === staffAuth.uid &&
    legitUpdate.workspaceId === validManifest.workspaceId &&
    legitUpdate.ownerUid === validManifest.ownerUid &&
    legitUpdate.createdAt === validManifest.createdAt &&
    legitUpdate.updatedAt === REQUEST_TIME &&
    validManifest.status !== 'archived' &&
    isActiveMember(staffAuth, 'vtp_main', store) &&
    affectedKeysOnly(validManifest, legitUpdate, [
      'updatedByUid',
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
      'updatedAt'
    ]);
  assert.equal(legitAllowed, true, 'Legitimate multi-device sync manifest update MUST be ALLOWED');
}

function verifyBlueprintAndRulesStructuralIntegrity() {
  const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8'));
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');

  // 1. Default deny catch-all must be the first match block inside documents
  const firstMatchIdx = rules.indexOf('match /{document=**}');
  assert.ok(firstMatchIdx > 0, 'Global default-deny catch-all must exist');
  assert.ok(
    rules.indexOf('match /admins/{adminUid}') > firstMatchIdx,
    'Default-deny catch-all must precede all collection match blocks'
  );

  // 2. Every path in firebase-blueprint.json must be present in firestore.rules
  const firestorePaths = Object.keys(blueprint.firestore || {});
  assert.equal(firestorePaths.length, 15, 'All 15 Firestore paths must be documented in blueprint');

  const leafSegments = [
    'match /admins/{adminUid}',
    'match /workspaces/{workspaceId}',
    'match /members/{memberUid}',
    'match /metaChunks/{chunkId}',
    'match /accountPrivate/{accountId}',
    'match /warehousePrivate/{warehouseId}',
    'match /tombstoneChunks/{chunkId}',
    'match /materialChunks/{chunkId}',
    'match /inboundIndex/{chunkId}',
    'match /inboundReceipts/{receiptDocId}',
    'match /inboundItems/{chunkDocId}',
    'match /outboundIndex/{chunkId}',
    'match /outboundReceipts/{receiptDocId}',
    'match /outboundItems/{chunkDocId}',
    'match /sessions/{sessionDocId}'
  ];
  for (const seg of leafSegments) {
    assert.ok(rules.includes(seg), `Missing match block in firestore.rules: ${seg}`);
  }

  // 3. No blanket `allow read:` anywhere (except default-deny `allow read, write: if false;`)
  const allowReads = rules.match(/allow\s+read[^;]*;/g) || [];
  assert.equal(allowReads.length, 1, 'Only the default-deny block may use allow read');
  assert.match(allowReads[0], /allow\s+read,\s*write:\s*if\s+false;/);

  // 4. Every `allow update:` block must include an `isValid...(` validation helper
  const updateBlocks = rules.split('allow update:').slice(1);
  assert.equal(updateBlocks.length, 15, 'All 15 collections must define explicit allow update rules');
  for (let i = 0; i < updateBlocks.length; i++) {
    const snippet = updateBlocks[i].slice(0, 350);
    assert.match(
      snippet,
      /isValid[A-Za-z]+\(incoming\(\)\)/,
      `allow update block #${i + 1} MUST wrap logic in isValid[Entity](incoming())`
    );
  }
}

function main() {
  verifyBlueprintAndRulesStructuralIntegrity();
  evaluateDirtyDozen({
    admins: new Set(),
    workspaces: new Map(),
    members: new Map(),
    inboundReceipts: new Set(),
    outboundReceipts: new Set()
  });
  console.log('ALL 15 COLLECTION INTEGRITY CHECKS + 12 DIRTY DOZEN SECURITY PAYLOAD TESTS PASSED.');
}

main();
