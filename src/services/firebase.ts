import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  type Auth,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  type Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFastFirestore(): Firestore {
  try {
    // Tự động phát hiện và chuyển sang Long-Polling ngay khi mạng/proxy chặn WebChannel (tránh treo 10-15 giây khi đăng nhập)
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

/* CRITICAL: Connect explicitly to the provisioned named Firestore database */
export const db = createFastFirestore();

function createResilientAuth(): Auth {
  if (typeof window === 'undefined') {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence
      ],
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createResilientAuth();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function purgeStaleFirebasePendingKeys(): void {
  if (typeof window === 'undefined') return;
  const storages: Storage[] = [];
  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore
  }
  try {
    storages.push(window.localStorage);
  } catch {
    // ignore
  }
  for (const store of storages) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (
          k &&
          (k.startsWith('firebase:pendingRedirect:') ||
            k.startsWith('firebase:redirectUser:') ||
            k.startsWith('firebase:previous_websocket_failure'))
        ) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        store.removeItem(k);
      }
    } catch {
      // ignore storage access error
    }
  }
}

export function signInWithGooglePopup(forceSelectAccount = true) {
  purgeStaleFirebasePendingKeys();
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  if (forceSelectAccount) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return signInWithPopup(auth, provider, browserPopupRedirectResolver);
}

export async function signOutAndPurgeFirebaseAuth(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signOut error
  }
  if (typeof window === 'undefined') return;
  const storages: Storage[] = [];
  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore
  }
  try {
    storages.push(window.localStorage);
  } catch {
    // ignore
  }
  for (const store of storages) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith('firebase:')) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        store.removeItem(k);
      }
    } catch {
      // ignore storage access error
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let quotaExceededListener: ((msg: string) => void) | null = null;
let firestoreCircuitOpenUntilMs = 0;

export function isFirestoreCircuitOpen(): boolean {
  return Date.now() < firestoreCircuitOpenUntilMs;
}

export function markFirestoreTemporarilyUnavailable(durationMs = 120_000): void {
  firestoreCircuitOpenUntilMs = Math.max(firestoreCircuitOpenUntilMs, Date.now() + durationMs);
}

export function onFirestoreQuotaError(cb: (msg: string) => void): () => void {
  quotaExceededListener = cb;
  return () => {
    if (quotaExceededListener === cb) {
      quotaExceededListener = null;
    }
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const code = String((error as any)?.code || '');
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (code === 'resource-exhausted' || rawMessage.includes('Quota exceeded')) {
    markFirestoreTemporarilyUnavailable(300_000);
    quotaExceededListener?.(
      'Đã chạm hạn mức đọc/ghi miễn phí trong ngày của Cloud Firestore (Spark Plan). Hệ thống đã tự động chuyển sang kênh đồng bộ máy chủ tốc độ cao.'
    );
  }

  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { signInWithPopup, signOut, onAuthStateChanged, firebaseConfig };
export type { FirebaseUser };
