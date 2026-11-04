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
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

/* CRITICAL: Connect explicitly to the provisioned named Firestore database */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (rawMessage.includes('Quota exceeded')) {
    quotaExceededListener?.(
      'Đã chạm hạn mức đọc/ghi miễn phí trong ngày của Cloud Firestore (Spark Plan). Hạn mức sẽ tự động đặt lại vào ngày mai.'
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

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export { signInWithPopup, signOut, onAuthStateChanged, firebaseConfig };
export type { FirebaseUser };
