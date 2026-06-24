import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type BrowserContextType =
  | 'installed-pwa'
  | 'supported-browser'
  | 'suspected-in-app-browser'
  | 'unsupported-browser'
  | 'unknown';

interface BrowserContextProps {
  context: BrowserContextType;
  isIOS: boolean;
  isAndroid: boolean;
  isIOSSafari: boolean;
  isWakeLockActive: boolean;
  copyUrlToClipboard: () => Promise<boolean>;
  getAndroidIntentUrl: () => string;
  forceMockContext: (newContext: BrowserContextType) => void;
}

const BrowserContext = createContext<BrowserContextProps | null>(null);

export const useBrowserContext = () => {
  const context = useContext(BrowserContext);
  if (!context) {
    throw new Error('useBrowserContext must be used within BrowserContextProvider');
  }
  return context;
};

export const BrowserContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [context, setContext] = useState<BrowserContextType>('unknown');
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [wakeLockSentinel, setWakeLockSentinel] = useState<WakeLockSentinel | null>(null);

  // Platform helpers
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/.test(ua);
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);

  const detectContext = useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'unknown';
    }

    // 1. Installed PWA detection
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      return 'installed-pwa';
    }

    // 2. Suspected in-app browser detection
    const inAppRegex = /KAKAOTALK|FB_IAB|FBAN|FBAV|Instagram|Line|Twitter|MicroMessenger/i;
    if (inAppRegex.test(ua)) {
      return 'suspected-in-app-browser';
    }

    // 3. Supported browser detection (capability checks)
    const hasWebSocket = 'WebSocket' in window;
    const hasBroadcastChannel = 'BroadcastChannel' in window;

    // Normal browser is not falsely blocked by one missing optional API (e.g. Wake Lock is optional)
    if (!hasWebSocket || !hasBroadcastChannel) {
      return 'unsupported-browser';
    }

    return 'supported-browser';
  }, [ua]);

  useEffect(() => {
    setContext(detectContext());
  }, [detectContext]);

  // Wake Lock & Visibility Adapter
  const requestWakeLock = async () => {
    if (context === 'supported-browser' || context === 'installed-pwa') {
      if ('wakeLock' in navigator && !wakeLockSentinel) {
        try {
          const sentinel = await navigator.wakeLock.request('screen');
          setWakeLockSentinel(sentinel);
          setIsWakeLockActive(true);

          sentinel.addEventListener('release', () => {
            setIsWakeLockActive(false);
            setWakeLockSentinel(null);
          });
        } catch (err) {
          console.warn('Wake Lock request failed:', err);
        }
      }
    }
  };

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
      } catch (err) {
        console.warn('Wake Lock release failed:', err);
      }
      setWakeLockSentinel(null);
      setIsWakeLockActive(false);
    }
  }, [wakeLockSentinel]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Request initial wake lock
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [context, releaseWakeLock]);

  const copyUrlToClipboard = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        return true;
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
    return false;
  };

  const getAndroidIntentUrl = (): string => {
    if (typeof window === 'undefined') return '';
    // Intent URL structure preserving full path and query
    const hostAndPath = window.location.host + window.location.pathname + window.location.search;
    return `intent://${hostAndPath}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(
      window.location.href,
    )};end`;
  };

  const forceMockContext = (newContext: BrowserContextType) => {
    setContext(newContext);
  };

  return (
    <BrowserContext.Provider
      value={{
        context,
        isIOS,
        isAndroid,
        isIOSSafari,
        isWakeLockActive,
        copyUrlToClipboard,
        getAndroidIntentUrl,
        forceMockContext,
      }}
    >
      {children}
    </BrowserContext.Provider>
  );
};
