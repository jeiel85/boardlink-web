import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface TabLeaderElectionProps {
  isLeader: boolean;
  claimTakeover: () => void;
  tabId: string;
}

const TabLeaderElectionContext = createContext<TabLeaderElectionProps | null>(null);

export const useTabLeaderElection = () => {
  const context = useContext(TabLeaderElectionContext);
  if (!context) {
    throw new Error('useTabLeaderElection must be used within TabLeaderElectionProvider');
  }
  return context;
};

export const TabLeaderElectionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLeader, setIsLeader] = useState(false);
  const tabIdRef = useRef<string>(Math.random().toString(36).substring(2, 9));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const releaseLockFnRef = useRef<(() => void) | null>(null);

  const requestLock = async () => {
    if (typeof navigator === 'undefined' || !('locks' in navigator)) {
      // Fallback if Web Locks is not supported
      setIsLeader(true);
      return;
    }

    navigator.locks.request('boardlink_tab_active_lock', { ifAvailable: true }, async (lock) => {
      if (lock) {
        setIsLeader(true);

        const lockReleasedPromise = new Promise<void>((resolve) => {
          releaseLockFnRef.current = resolve;
        });

        await lockReleasedPromise;
        setIsLeader(false);
      } else {
        setIsLeader(false);
      }
    });
  };

  const claimTakeover = () => {
    // 1. Send takeover message to other tabs
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'TAKEOVER_CLAIMED',
        senderTabId: tabIdRef.current,
      });
    }

    // 2. Request the lock ourselves
    setTimeout(() => {
      requestLock();
    }, 50);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize BroadcastChannel
    const channel = new BroadcastChannel('boardlink_tab_election');
    channelRef.current = channel;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'TAKEOVER_CLAIMED') {
        if (data.senderTabId !== tabIdRef.current) {
          // If we are currently the leader, release the lock and step down
          if (releaseLockFnRef.current) {
            releaseLockFnRef.current();
            releaseLockFnRef.current = null;
          }
          setIsLeader(false);
        }
      }
    };

    channel.addEventListener('message', handleMessage);

    // Initial attempt to acquire the lock
    requestLock();

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      if (releaseLockFnRef.current) {
        releaseLockFnRef.current();
      }
    };
  }, []);

  return (
    <TabLeaderElectionContext.Provider
      value={{
        isLeader,
        claimTakeover,
        tabId: tabIdRef.current,
      }}
    >
      {children}
    </TabLeaderElectionContext.Provider>
  );
};
