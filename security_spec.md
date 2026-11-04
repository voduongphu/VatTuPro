# Security Specification (`security_spec.md`)

## 1. Master Source of Truth & Data Invariants

1. **Default-Deny Zero Trust**: All paths in `/databases/{database}/documents/{document=**}` default to `allow read, write: if false;`. Zero `allow list` rules exist anywhere in the schema; every client read uses deterministic document IDs (`allow get` only), eliminating query-scraping vectors.
2. **Verified Identity Mandate**: Every read and write requires `request.auth != null && request.auth.token.email_verified == true`. Email-only checks without `email_verified == true` are strictly forbidden.
3. **Master Gate Relational Sync**: `/workspaces/{workspaceId}` (`workspaceId == 'vtp_main'`) is the Master Source of Truth. Every subcollection (`/metaChunks`, `/tombstoneChunks`, `/materialChunks`, `/inboundIndex`, `/inboundReceipts`, `/inboundItems`, `/outboundIndex`, `/outboundReceipts`, `/outboundItems`, `/sessions`) verifies via `get()` that `/workspaces/{workspaceId}` exists with `status == 'active'` AND that `/workspaces/{workspaceId}/members/{request.auth.uid}` exists with `status == 'active'` (or `isAdmin()`). Revoking a member (`status = 'revoked'`) or deleting their member document synchronously revokes access to every sub-resource.
4. **PII Split-Collection Isolation**: Warehouse user PII (`email`, `phone`) is isolated in `/workspaces/{workspaceId}/accountPrivate/{accountId}` and warehouse phone contacts in `/workspaces/{workspaceId}/warehousePrivate/{warehouseId}`, both restricted exclusively to `isAdmin()`. Shared `/metaChunks` contain zero PII fields.
5. **Bounded Native Collections (No `JSON.stringify`, No Unbounded Arrays)**: All chunk arrays (`items`) are native Firestore lists bounded to `size() <= 200` with element type checks (`items.size() == 0 || items[0] is map`).
6. **Temporal & Immutability Integrity**: Every document enforces `createdAt == request.time` and `updatedAt == request.time` on `create`, and `createdAt == existing().createdAt` plus `updatedAt == request.time` on `update`. Primary relational keys (`workspaceId`, `ownerUid`, `uid`, `docId`, `receiptDocId`, `sessionDocId`, `userKey`) are immutable after creation.
7. **Atomicity Invariants (`existsAfter`)**: Creating `/workspaces/vtp_main` requires `existsAfter(.../members/$(request.auth.uid))` in the same atomic batch. Creating `/inboundItems/{chunkDocId}` or `/outboundItems/{chunkDocId}` requires the parent receipt header (`inboundReceipts/$(incoming().receiptDocId)` / `outboundReceipts/$(incoming().receiptDocId)`) to exist via `exists()` or `existsAfter()`.
8. **Terminal State Locking**: Archiving `/workspaces/{workspaceId}` (`status == 'archived'`) or revoking `/members/{memberUid}` (`status == 'revoked'`) locks all non-admin updates.

---

## 2. Example Payloads for the Eight Pillars of Hardened Rules

1. **Pillar 1 (Master Gate)**: Revoked member (`members/uid_staff.status == 'revoked'`) attempts `getDoc('/workspaces/vtp_main/materialChunks/chunk_0')` -> `PERMISSION_DENIED`.
2. **Pillar 2 (Anti-Update-Gap Blueprint)**: Member sends `updateDoc` on `/workspaces/vtp_main/inboundReceipts/rcp_1` with `totalQuantity: "NOT_A_NUMBER"` -> rejected by `isValidInboundReceiptHeader(incoming())` wrapping `allow update`.
3. **Pillar 3 (Path Variable & Size Guard)**: Attacker targets `/workspaces/vtp_main/materialChunks/chunk$bad!id` or sends 5,000-char `name` -> rejected by `isValidId(chunkId)` and `.size() <= maxLength`.
4. **Pillar 4 (Tiered Identity Logic)**: Regular member attempts to update `allowSelfJoin` or `status` on `/workspaces/vtp_main` -> rejected because member tier `affectedKeys().hasOnly(...)` excludes admin-only governance fields; only `isAdmin()` tier permits governance actions.
5. **Pillar 5 (Total Array Guarding)**: Attacker writes 201 items (`items.length == 201`) or primitive string elements (`items: ["bad"]`) to `/materialChunks/chunk_0` -> rejected by `data.items.size() <= 200 && (data.items.size() == 0 || data.items[0] is map)`.
6. **Pillar 6 (PII Isolation)**: Non-admin authenticated member attempts `getDoc('/workspaces/vtp_main/accountPrivate/user-admin-01')` -> `PERMISSION_DENIED`.
7. **Pillar 7 (Atomicity Guarantee)**: Client creates `/workspaces/vtp_main/inboundItems/rcp_orphan_0` without `inboundReceipts/rcp_orphan` existing or committed in the same batch -> rejected by `exists(...) || existsAfter(...)`.
8. **Pillar 8 (Query Enforcer / Zero-List Hardening)**: Attacker runs `getDocs(collection(db, 'workspaces/vtp_main/inboundReceipts'))` -> `PERMISSION_DENIED` because `list` is completely disallowed across all collections.

---

## 3. The "Dirty Dozen" Adversarial Payloads (All Must Return `PERMISSION_DENIED`)

1. **Payload 1 — Shadow Field Injection (`Ghost Field`)**: Valid `WorkspaceManifest` update plus `"isVerified": true` -> rejected by `data.keys().hasOnly(...)` in `isValidWorkspaceManifest`.
2. **Payload 2 — Unverified Admin Email Spoof**: Token `{ email: "voduongphu@gmail.com", email_verified: false }` reading `/accountPrivate/user-admin-01` -> rejected by `isVerifiedUser()`.
3. **Payload 3 — Self-Assigned Admin Role on Member Join**: Creating `/workspaces/vtp_main/members/uid_attacker` with `"memberRole": "admin"` -> rejected by `incoming().memberRole == 'member'`.
4. **Payload 4 — Identity Spoofing (`updatedByUid` Forgery)**: Member `uid_a` writes `MaterialChunk` with `"updatedByUid": "uid_b"` -> rejected by `data.updatedByUid == request.auth.uid`.
5. **Payload 5 — PII Blanket Read**: Active non-admin member `uid_staff` calls `getDoc` on `/workspaces/vtp_main/accountPrivate/user-1791865267798` -> rejected (`isAdmin()` required).
6. **Payload 6 — Unfiltered Collection `list` Scraping**: Authenticated member executes collection query on `/workspaces/vtp_main/sessions` -> rejected (`allow list` disabled).
7. **Payload 7 — Denial-of-Wallet Oversized String**: Creating `InboundReceiptHeader` with a 10,000-character `notes` string -> rejected (`data.notes.size() <= 2000`).
8. **Payload 8 — Array Overflow (> 200 items)**: Writing 205 items to `/workspaces/vtp_main/inboundItems/rcp1_0` -> rejected (`data.items.size() <= 200`).
9. **Payload 9 — Forged Client Timestamp**: Updating `ActiveDeviceSession` with `updatedAt: Timestamp.fromMillis(Date.now() - 60000)` -> rejected (`incoming().updatedAt == request.time`).
10. **Payload 10 — Immortal Field Mutation (`createdAt` / `ownerUid`)**: Updating `/workspaces/vtp_main` to overwrite `ownerUid` or `createdAt` -> rejected by immutability guards.
11. **Payload 11 — Orphaned Item Chunk Write**: Creating `/workspaces/vtp_main/outboundItems/ghost_0` when `outboundReceipts/ghost` does not exist -> rejected by `exists() || existsAfter()`.
12. **Payload 12 — Terminal State Escape**: Revoked user (`members/uid_revoked.status == 'revoked'`) attempting to update their member doc back to `status: 'active'` -> rejected by terminal state lock (`existing().status != 'revoked'`).

---

## 4. Phase 5 Hardened Red Team Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource / Value Poisoning | `isValid[Entity]` Wraps Update | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/admins/{adminUid}` | Blocked (`allow write: if false` for non-bootstrapped; `uid == adminUid`) | N/A | Blocked (`note.size() <= 200`, `isValidId`) | Yes (`isValidAdminRecord`) | PASS |
| `/workspaces/{workspaceId}` | Blocked (`ownerUid == auth.uid` on create, immutable on update; `updatedByUid == auth.uid`) | Blocked (`status != 'archived'` unless `isAdmin()`) | Blocked (`workspaceId == 'vtp_main'`, bounded strings & chunk counts) | Yes (`isValidWorkspaceManifest`) | PASS |
| `/workspaces/{workspaceId}/members/{memberUid}` | Blocked (`uid == memberUid == auth.uid`, `memberRole == 'member'` on self-join) | Blocked (`status != 'revoked'` unless `isAdmin()`) | Blocked (`displayName.size() <= 160`) | Yes (`isValidWorkspaceMember`) | PASS |
| `/workspaces/{workspaceId}/metaChunks/{chunkId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (`items.size() <= 200`, map check) | Yes (`isValidMetaChunk`) | PASS |
| `/workspaces/{workspaceId}/accountPrivate/{accountId}` | Blocked (`isAdmin()` only + `updatedByUid == auth.uid`) | Isolated Split-Collection | Blocked (`email <= 200`, `phone <= 64`) | Yes (`isValidAccountPrivatePii`) | PASS |
| `/workspaces/{workspaceId}/warehousePrivate/{warehouseId}` | Blocked (`isAdmin()` only + `updatedByUid == auth.uid`) | Isolated Split-Collection | Blocked (`phone <= 64`) | Yes (`isValidWarehousePrivatePii`) | PASS |
| `/workspaces/{workspaceId}/tombstoneChunks/{chunkId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (`items.size() <= 200`) | Yes (`isValidTombstoneChunk`) | PASS |
| `/workspaces/{workspaceId}/materialChunks/{chunkId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (`items.size() <= 200`) | Yes (`isValidMaterialChunk`) | PASS |
| `/workspaces/{workspaceId}/inboundIndex/{chunkId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (`items.size() <= 200`, `receiptKind == 'inbound'`) | Yes (`isValidReceiptIndexChunk`) | PASS |
| `/workspaces/{workspaceId}/inboundReceipts/{receiptDocId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (all 30+ fields strictly typed & size-bounded) | Yes (`isValidInboundReceiptHeader`) | PASS |
| `/workspaces/{workspaceId}/inboundItems/{chunkDocId}` | Blocked (`updatedByUid == auth.uid`) | Atomic parent check (`exists || existsAfter`) | Blocked (`items.size() <= 200`) | Yes (`isValidInboundItemChunk`) | PASS |
| `/workspaces/{workspaceId}/outboundIndex/{chunkId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (`items.size() <= 200`, `receiptKind == 'outbound'`) | Yes (`isValidReceiptIndexChunk`) | PASS |
| `/workspaces/{workspaceId}/outboundReceipts/{receiptDocId}` | Blocked (`updatedByUid == auth.uid`) | Master Gate (`isActiveMember`) | Blocked (all fields strictly typed & size-bounded) | Yes (`isValidOutboundReceiptHeader`) | PASS |
| `/workspaces/{workspaceId}/outboundItems/{chunkDocId}` | Blocked (`updatedByUid == auth.uid`) | Atomic parent check (`exists || existsAfter`) | Blocked (`items.size() <= 200`) | Yes (`isValidOutboundItemChunk`) | PASS |
| `/workspaces/{workspaceId}/sessions/{sessionDocId}` | Blocked (`updatedByUid == auth.uid`, immutable `userKey`/`sessionDocId`) | Master Gate (`isActiveMember`) | Blocked (bounded strings & timestamps) | Yes (`isValidActiveDeviceSession`) | PASS |
