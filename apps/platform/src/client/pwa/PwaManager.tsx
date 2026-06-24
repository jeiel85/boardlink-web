import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useBrowserContext } from '../browser-context/BrowserContext.js';

interface PwaManagerProps {
  isUpdateAvailable: boolean;
  updateDeferred: boolean;
  matchActivityLock: boolean;
  showInstallBanner: boolean;
  setMatchActivityLock: (active: boolean) => void;
  triggerUpdate: () => void;
  triggerInstall: () => Promise<boolean>;
  dismissInstallBanner: () => void;
  simulateMockUpdate: () => void; // For testing
}

const PwaManagerContext = createContext<PwaManagerProps | null>(null);

export const usePwaManager = () => {
  const context = useContext(PwaManagerContext);
  if (!context) {
    throw new Error('usePwaManager must be used within PwaManagerProvider');
  }
  return context;
};

const DISMISSAL_KEY = 'boardlink_pwa_dismiss_time';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PwaManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isIOSSafari } = useBrowserContext();
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [updateDeferred, setUpdateDeferred] = useState(false);
  const [matchActivityLock, _setMatchActivityLock] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const isUpdateAvailableRef = useRef(isUpdateAvailable);

  useEffect(() => {
    isUpdateAvailableRef.current = isUpdateAvailable;
  }, [isUpdateAvailable]);

  // Set lock and check if we should apply deferred update
  const setMatchActivityLock = useCallback((active: boolean) => {
    _setMatchActivityLock(active);
    if (!active && isUpdateAvailableRef.current) {
      setUpdateDeferred(false);
    }
  }, []);

  // Register service worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registrationRef.current = reg;

        // Check if there is already a waiting worker
        if (reg.waiting) {
          setIsUpdateAvailable(true);
        }

        // Listen for new workers
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setIsUpdateAvailable(true);
              }
            });
          }
        });
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // Handle deferral state based on active match lock
  useEffect(() => {
    if (isUpdateAvailable) {
      if (matchActivityLock) {
        setUpdateDeferred(true);
      } else {
        setUpdateDeferred(false);
      }
    }
  }, [isUpdateAvailable, matchActivityLock]);

  // Handle PWA Install Intercept
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;

      // Check 7-day dismissal policy
      const lastDismissed = localStorage.getItem(DISMISSAL_KEY);
      const now = Date.now();
      if (!lastDismissed || now - parseInt(lastDismissed, 10) > SEVEN_DAYS_MS) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Show banner for iOS Safari on mount if 7-day dismissal allows
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isIOSSafari) {
      const lastDismissed = localStorage.getItem(DISMISSAL_KEY);
      const now = Date.now();
      if (!lastDismissed || now - parseInt(lastDismissed, 10) > SEVEN_DAYS_MS) {
        setShowInstallBanner(true);
      }
    }
  }, [isIOSSafari]);

  const triggerUpdate = () => {
    const reg = registrationRef.current;
    // Don't activate a waiting service worker while matchActivityLock exists
    if (matchActivityLock) {
      console.warn('Update triggered but deferred due to active matchActivityLock.');
      return;
    }
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // In mock testing scenarios, reload directly
      window.location.reload();
    }
  };

  const triggerInstall = async (): Promise<boolean> => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      return false;
    }
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    deferredPromptRef.current = null;
    setShowInstallBanner(false);
    return outcome === 'accepted';
  };

  const dismissInstallBanner = () => {
    localStorage.setItem(DISMISSAL_KEY, Date.now().toString());
    setShowInstallBanner(false);
  };

  // Mocking method to help E2E/Unit testing simulate finding a new service worker version
  const simulateMockUpdate = () => {
    setIsUpdateAvailable(true);
  };

  return (
    <PwaManagerContext.Provider
      value={{
        isUpdateAvailable,
        updateDeferred,
        matchActivityLock,
        showInstallBanner,
        setMatchActivityLock,
        triggerUpdate,
        triggerInstall,
        dismissInstallBanner,
        simulateMockUpdate,
      }}
    >
      {children}
    </PwaManagerContext.Provider>
  );
};
