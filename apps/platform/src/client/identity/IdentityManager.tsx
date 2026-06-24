import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UserId, generateDisplayName } from '@boardlink/domain';

export interface DeviceIdentity {
  keyPair: CryptoKeyPair;
  publicId: UserId;
  displayName: string;
}

interface IdentityContextProps {
  identity: DeviceIdentity | null;
  sessionToken: string | null;
  friendCode: string | null;
  isAuthenticating: boolean;
  isIndexedDbSupported: boolean;
  isPersistentStorageGranted: boolean;
  resetIdentity: () => Promise<void>;
  refreshSession: () => Promise<void>;
  issueFriendCode: () => Promise<void>;
  rotateFriendCode: () => Promise<void>;
  revokeFriendCode: () => Promise<void>;
  lookupFriendCode: (code: string) => Promise<{ publicId: string; displayName: string } | null>;
  forceMockIdentityBlock: (block: boolean) => void;
  mockBlocked: boolean;
}

const IdentityContext = createContext<IdentityContextProps | null>(null);

export const useIdentity = () => {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity must be used within IdentityContextProvider');
  }
  return context;
};

const DB_NAME = 'boardlink_identity_db';
const STORE_NAME = 'identity_store';
const KEY_NAME = 'device_identity';

export const IdentityContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isIndexedDbSupported, setIsIndexedDbSupported] = useState(true);
  const [isPersistentStorageGranted, setIsPersistentStorageGranted] = useState(false);
  const [mockBlocked, setMockBlocked] = useState(false);

  const mockBlockedRef = useRef(mockBlocked);
  useEffect(() => {
    mockBlockedRef.current = mockBlocked;
  }, [mockBlocked]);

  // Open IndexedDB database
  const getDatabase = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (mockBlockedRef.current || typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported or is blocked.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open database.'));
      };
    });
  }, []);

  // Load identity from IndexedDB or fall back to memory
  const loadIdentityFromDb = useCallback(
    async (db: IDBDatabase): Promise<DeviceIdentity | null> => {
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(KEY_NAME);

          request.onsuccess = () => {
            resolve(request.result || null);
          };

          request.onerror = () => {
            reject(request.error || new Error('Failed to read from store.'));
          };
        } catch (err) {
          reject(err);
        }
      });
    },
    [],
  );

  // Save identity to IndexedDB
  const saveIdentityToDb = useCallback(
    async (db: IDBDatabase, idRecord: DeviceIdentity): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.put(idRecord, KEY_NAME);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error || new Error('Failed to write to store.'));
        } catch (err) {
          reject(err);
        }
      });
    },
    [],
  );

  // Delete identity from IndexedDB
  const deleteIdentityFromDb = useCallback(async (db: IDBDatabase): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(KEY_NAME);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('Failed to delete from store.'));
      } catch (err) {
        reject(err);
      }
    });
  }, []);

  // Generate a brand new cryptographic P-256 identity
  const createNewIdentity = async (): Promise<DeviceIdentity> => {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify'],
    );

    const spki = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', spki);
    const publicId = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
    const displayName = generateDisplayName(locale);

    return {
      keyPair,
      publicId: UserId(publicId),
      displayName,
    };
  };

  // Perform persistent storage permission request
  const requestPersistentStorage = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isGranted = await navigator.storage.persist();
        setIsPersistentStorageGranted(isGranted);
      } catch (err) {
        console.warn('Persistent storage request failed:', err);
      }
    }
  };

  // Initialize identity manager
  const initializeIdentity = useCallback(async () => {
    try {
      const db = await getDatabase();
      setIsIndexedDbSupported(true);

      let loaded = await loadIdentityFromDb(db);
      if (!loaded) {
        loaded = await createNewIdentity();
        await saveIdentityToDb(db, loaded);
        await requestPersistentStorage();
      }
      setIdentity(loaded);
    } catch (err) {
      console.warn('IndexedDB identity loading failed. Falling back to in-memory.', err);
      setIsIndexedDbSupported(false);

      // Fallback in-memory identity
      const tempId = await createNewIdentity();
      setIdentity(tempId);
    }
  }, [getDatabase, loadIdentityFromDb, saveIdentityToDb]);

  useEffect(() => {
    initializeIdentity();
  }, [initializeIdentity]);

  // Session challenge signature authentication flow
  const refreshSession = useCallback(async () => {
    if (!identity) return;

    setIsAuthenticating(true);
    try {
      // 1. Get auth challenge from server
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!challengeRes.ok) {
        throw new Error('Failed to fetch auth challenge');
      }
      const challengeData = (await challengeRes.json()) as {
        challenge: string;
        serverToken: string;
      };
      const { challenge, serverToken } = challengeData;

      // 2. Sign challenge using client private key
      const encoder = new TextEncoder();
      const encodedChallenge = encoder.encode(challenge);
      const signatureBuffer = await window.crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        identity.keyPair.privateKey,
        encodedChallenge,
      );

      const signatureHex = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // 3. Export public key as JWK to send to server
      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', identity.keyPair.publicKey);

      // 4. Verify signature on server and get short-lived session token
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverToken,
          signature: signatureHex,
          publicKeyJwk,
          displayName: identity.displayName,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error('Authentication challenge failed on server');
      }

      const verifyData = (await verifyRes.json()) as { sessionToken: string; friendCode?: string };
      setSessionToken(verifyData.sessionToken);

      // If friend code is returned, store it
      if (verifyData.friendCode) {
        setFriendCode(verifyData.friendCode);
      } else {
        setFriendCode(null);
      }
    } catch (err) {
      console.error('Session authentication failed:', err);
      setSessionToken(null);
      setFriendCode(null);
    } finally {
      setIsAuthenticating(false);
    }
  }, [identity]);

  // Authenticate whenever identity is successfully loaded/changed
  useEffect(() => {
    if (identity) {
      refreshSession();
    }
  }, [identity, refreshSession]);

  const resetIdentity = async () => {
    try {
      const db = await getDatabase();
      await deleteIdentityFromDb(db);
    } catch (err) {
      console.warn('Reset identity failed to clear IndexedDB:', err);
    }
    setIdentity(null);
    setSessionToken(null);
    setFriendCode(null);
    // Reload the page to recreate a clean state
    window.location.reload();
  };

  // Friend code actions
  const issueFriendCode = async () => {
    if (!sessionToken) return;

    try {
      const res = await fetch('/api/friend-code/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) throw new Error('Failed to issue friend code');
      const data = (await res.json()) as { friendCode: string };
      setFriendCode(data.friendCode);
    } catch (err) {
      console.error('Issue friend code failed:', err);
    }
  };

  const rotateFriendCode = async () => {
    if (!sessionToken) return;

    try {
      const res = await fetch('/api/friend-code/rotate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) throw new Error('Failed to rotate friend code');
      const data = (await res.json()) as { friendCode: string };
      setFriendCode(data.friendCode);
    } catch (err) {
      console.error('Rotate friend code failed:', err);
    }
  };

  const revokeFriendCode = async () => {
    if (!sessionToken) return;

    try {
      const res = await fetch('/api/friend-code/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) throw new Error('Failed to revoke friend code');
      setFriendCode(null);
    } catch (err) {
      console.error('Revoke friend code failed:', err);
    }
  };

  const lookupFriendCode = async (
    code: string,
  ): Promise<{ publicId: string; displayName: string } | null> => {
    try {
      const res = await fetch(`/api/friend-code/lookup/${encodeURIComponent(code)}`, {
        method: 'GET',
      });
      if (res.status === 404) return null;
      if (res.status === 429) {
        throw new Error('429: Rate limit exceeded. Too many lookups.');
      }
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Lookup failed');
      }
      return (await res.json()) as { publicId: string; displayName: string };
    } catch (err) {
      console.error('Friend code lookup failed:', err);
      throw err; // rethrow to let callers handle errors (e.g. rate limit 429)
    }
  };

  const forceMockIdentityBlock = (block: boolean) => {
    setMockBlocked(block);
    // Trigger re-initialization
    setTimeout(() => {
      initializeIdentity();
    }, 50);
  };

  return (
    <IdentityContext.Provider
      value={{
        identity,
        sessionToken,
        friendCode,
        isAuthenticating,
        isIndexedDbSupported,
        isPersistentStorageGranted,
        resetIdentity,
        refreshSession,
        issueFriendCode,
        rotateFriendCode,
        revokeFriendCode,
        lookupFriendCode,
        forceMockIdentityBlock,
        mockBlocked,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
};
