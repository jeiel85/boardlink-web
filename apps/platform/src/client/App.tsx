import { useState, useEffect } from 'react';
import { PROTOCOL_VERSION, BUILD_ID } from '@boardlink/protocol';
import {
  BrowserContextProvider,
  useBrowserContext,
  BrowserContextType,
} from './browser-context/BrowserContext.js';
import { PwaManagerProvider, usePwaManager } from './pwa/PwaManager.js';
import { TabLeaderElectionProvider, useTabLeaderElection } from './realtime/TabLeaderElection.js';
import { IdentityContextProvider, useIdentity } from './identity/IdentityManager.js';
import { InAppGate } from './components/InAppGate.js';
import { InstallBanner } from './components/InstallBanner.js';
import { TabActiveGate } from './components/TabActiveGate.js';
import { VsComputer } from './components/VsComputer.js';
import { OnlineHome, OnlineRoom } from './components/OnlineRoom.js';
import { I18nProvider, useI18n } from './i18n/i18n.js';

interface BoardLinkE2E {
  navigate: (path: string) => void;
  forceMockContext: (newContext: BrowserContextType) => void;
  simulateMockUpdate: () => void;
  triggerUpdate: () => void;
  claimTakeover: () => void;
  isLeader: () => boolean;
  getTabId: () => string;
  isUpdateAvailable: () => boolean;
  isUpdateDeferred: () => boolean;
  matchActivityLock: () => boolean;
  forceMockIdentityBlock: (block: boolean) => void;
  getFriendCode: () => string | null;
}

function AppContent() {
  const { t, lang, setLang } = useI18n();
  const { context, forceMockContext } = useBrowserContext();
  const {
    isUpdateAvailable,
    updateDeferred,
    matchActivityLock,
    setMatchActivityLock,
    simulateMockUpdate,
    triggerUpdate,
  } = usePwaManager();
  const { isLeader, claimTakeover, tabId } = useTabLeaderElection();

  // Identity manager integration
  const {
    identity,
    sessionToken,
    friendCode,
    isIndexedDbSupported,
    isPersistentStorageGranted,
    resetIdentity,
    issueFriendCode,
    rotateFriendCode,
    revokeFriendCode,
    lookupFriendCode,
    forceMockIdentityBlock,
    mockBlocked,
  } = useIdentity();

  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/',
  );
  const [showSettings, setShowSettings] = useState(false);

  // Friend code lookup states
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    publicId: string;
    displayName: string;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupErrorMsg, setLookupErrorMsg] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
  };

  const getRouteParam = (pattern: RegExp) => {
    const match = currentPath.match(pattern);
    return match ? match[1] : null;
  };

  const roomId = getRouteParam(/^\/room\/([^/]+)/);
  const token = getRouteParam(/^\/join\/([^/]+)/);

  // Active match update deferral lock logic
  useEffect(() => {
    if (roomId) {
      setMatchActivityLock(true);
      return () => {
        setMatchActivityLock(false);
      };
    }
    return () => {};
  }, [roomId, setMatchActivityLock]);

  // Expose global helpers for Playwright E2E automation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (
        window as unknown as {
          __BOARDLINK_E2E__: BoardLinkE2E;
        }
      ).__BOARDLINK_E2E__ = {
        navigate,
        forceMockContext,
        simulateMockUpdate,
        triggerUpdate,
        claimTakeover,
        isLeader: () => isLeader,
        getTabId: () => tabId,
        isUpdateAvailable: () => isUpdateAvailable,
        isUpdateDeferred: () => updateDeferred,
        matchActivityLock: () => matchActivityLock,
        forceMockIdentityBlock,
        getFriendCode: () => friendCode,
      };
    }
  }, [
    isLeader,
    tabId,
    isUpdateAvailable,
    updateDeferred,
    matchActivityLock,
    forceMockIdentityBlock,
    friendCode,
  ]);

  // Real-time Route Gate inside in-app browser webviews
  const isRealTimeRoute = currentPath.startsWith('/room/');
  const showInAppGate = isRealTimeRoute && context === 'suspected-in-app-browser';

  const handleLookup = async () => {
    if (!lookupQuery.trim()) return;
    setIsSearching(true);
    setLookupResult(null);
    setLookupError(null);
    setLookupErrorMsg(null);
    try {
      const res = await lookupFriendCode(lookupQuery.trim());
      if (res) {
        setLookupResult(res);
      } else {
        setLookupError('notfound');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Rate limit') || errMsg.includes('429')) {
        setLookupError('ratelimit');
      } else {
        setLookupError('error');
        setLookupErrorMsg(errMsg);
      }
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Actionable IndexedDB Error Banner if unsupported (e.g. Incognito) */}
      {!isIndexedDbSupported && (
        <div style={styles.errorBanner} id="indexeddb-error-banner">
          <span style={styles.bannerIcon}>⚠️</span>
          <div style={styles.bannerText}>{t('app.indexedDbWarn')}</div>
        </div>
      )}

      {/* Route-specific components */}
      {showInAppGate && <InAppGate routePath={currentPath} />}
      <TabActiveGate />
      <InstallBanner />

      {/* Main UI layout */}
      <main style={styles.main}>
        <div style={styles.topbar}>
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            style={styles.settingsToggle}
            id="lang-toggle"
          >
            {lang === 'ko' ? 'EN' : '한국어'}
          </button>
          {!roomId && !token && (
            <button
              onClick={() => setShowSettings((s) => !s)}
              style={styles.settingsToggle}
              id="settings-toggle"
            >
              {showSettings ? t('app.close') : t('app.settings')}
            </button>
          )}
        </div>
        <header style={styles.header}>
          <h1 style={styles.title} onClick={() => navigate('/')}>
            BoardLink
          </h1>
          <p style={styles.subtitle}>{t('app.subtitle')}</p>
        </header>

        {showSettings && !roomId && !token && (
          <>
            <h2 style={styles.settingsTitle}>{t('app.settingsTitle')}</h2>
            {/* User Identity Profile Card */}
            <section style={styles.card} id="identity-card">
              <h2 style={styles.sectionHeader}>{t('profile.title')}</h2>
              {identity ? (
                <div style={styles.profileDetails}>
                  <div style={styles.profileRow}>
                    <span style={styles.label}>{t('profile.displayName')}</span>
                    <span style={styles.profileName} id="profile-display-name">
                      {identity.displayName}
                    </span>
                  </div>
                  <div style={styles.profileRow}>
                    <span style={styles.label}>{t('profile.publicId')}</span>
                    <span style={styles.profileId} id="profile-public-id">
                      {identity.publicId}
                    </span>
                  </div>
                  <div style={styles.profileRow}>
                    <span style={styles.label}>{t('profile.storage')}</span>
                    <span style={styles.value} id="persistent-storage-status">
                      {isPersistentStorageGranted
                        ? t('profile.persistent')
                        : t('profile.temporary')}
                    </span>
                  </div>

                  <div style={styles.divider} />

                  <div style={styles.friendCodeSection}>
                    <span style={styles.label}>{t('profile.friendCode')}</span>
                    {friendCode ? (
                      <div style={styles.codeRow}>
                        <span style={styles.codeValue} id="friend-code-value">
                          {friendCode}
                        </span>
                        <div style={styles.codeActions}>
                          <button
                            onClick={rotateFriendCode}
                            style={styles.actionButton}
                            id="rotate-friend-code-btn"
                            disabled={!sessionToken}
                          >
                            {t('profile.rotate')}
                          </button>
                          <button
                            onClick={revokeFriendCode}
                            style={styles.revokeButton}
                            id="revoke-friend-code-btn"
                            disabled={!sessionToken}
                          >
                            {t('profile.revoke')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={issueFriendCode}
                        style={styles.issueButton}
                        id="issue-friend-code-btn"
                        disabled={!sessionToken}
                      >
                        {t('profile.issue')}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={resetIdentity}
                    style={styles.resetButton}
                    id="reset-identity-btn"
                  >
                    {t('profile.reset')}
                  </button>
                </div>
              ) : (
                <p style={styles.description}>{t('profile.generating')}</p>
              )}
            </section>

            {/* Friend Code Lookup Panel */}
            <section style={styles.card} id="lookup-card">
              <h2 style={styles.sectionHeader}>{t('lookup.title')}</h2>
              <p style={styles.description}>{t('lookup.desc')}</p>
              <div style={styles.lookupInputRow}>
                <input
                  type="text"
                  placeholder="e.g. ABCD-1234"
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value.toUpperCase())}
                  style={styles.input}
                  id="lookup-input"
                />
                <button
                  onClick={handleLookup}
                  disabled={isSearching}
                  style={styles.primaryButton}
                  id="lookup-btn"
                >
                  {isSearching ? t('lookup.searching') : t('lookup.search')}
                </button>
              </div>

              {/* Lookup Results */}
              {lookupResult && (
                <div style={styles.successResult} id="lookup-result-success">
                  <span style={styles.resultLabel}>{t('lookup.found')}</span>
                  <strong style={styles.resultName}>{lookupResult.displayName}</strong>
                  <code style={styles.resultId}>{lookupResult.publicId}</code>
                </div>
              )}

              {lookupError === 'notfound' && (
                <div style={styles.errorResult} id="lookup-result-notfound">
                  {t('lookup.notfound')}
                </div>
              )}

              {lookupError === 'ratelimit' && (
                <div style={styles.errorResult} id="lookup-result-ratelimit">
                  {t('lookup.ratelimit')}
                </div>
              )}

              {lookupError === 'error' && (
                <div style={styles.errorResult} id="lookup-result-error">
                  {t('lookup.error')} {lookupErrorMsg}
                </div>
              )}
            </section>
          </>
        )}

        {/* Dynamic Route Pages */}
        {roomId ? (
          <OnlineRoom
            roomCode={roomId.toUpperCase()}
            sessionToken={sessionToken}
            myId={identity?.publicId ?? null}
            onExit={() => navigate('/')}
          />
        ) : token ? (
          <section style={styles.card} id="join-page">
            <h2 style={styles.sectionHeader}>✉️ Invitation Received</h2>
            <p style={styles.description}>
              You have been invited to join a board game session. This invitation preview page
              compiles safely within in-app webviews.
            </p>
            <div style={styles.tokenContainer}>
              <span style={styles.label}>Token:</span>
              <span style={styles.tokenValue} id="invitation-token">
                {token}
              </span>
            </div>
            <button
              onClick={() => navigate(`/room/${token}`)}
              style={styles.primaryButton}
              id="accept-invitation-button"
            >
              Enter Game Room
            </button>
          </section>
        ) : showSettings ? null : (
          <>
            <OnlineHome sessionToken={sessionToken} navigate={navigate} />
            <VsComputer />
          </>
        )}

        {showSettings && !roomId && !token && (
          <>
            {/* System Dashboard */}
            <section style={styles.card}>
              <h2 style={styles.sectionHeader}>{t('system.title')}</h2>
              <div style={styles.statusGrid}>
                <div style={styles.statusItem}>
                  <span style={styles.label}>{t('system.protocol')}</span>
                  <span style={styles.value} id="protocol-version">
                    {PROTOCOL_VERSION}
                  </span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.label}>{t('system.build')}</span>
                  <span style={styles.value} id="build-id">
                    {BUILD_ID}
                  </span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.label}>{t('system.leader')}</span>
                  <span
                    style={isLeader ? styles.badgeLeader : styles.badgeFollower}
                    id="leader-status"
                  >
                    {isLeader ? t('system.leaderOn') : t('system.leaderOff')}
                  </span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.label}>{t('system.service')}</span>
                  <span style={styles.badgeLeader} id="service-status">
                    {t('system.online')}
                  </span>
                </div>
              </div>
            </section>

            {/* E2E Testing and Mock Controls Panel */}
            <section style={styles.testingPanel} id="testing-controls-panel">
              <h3 style={styles.panelTitle}>⚙️ E2E Mock Settings</h3>
              <div style={styles.panelGrid}>
                <div style={styles.panelRow}>
                  <span style={styles.panelLabel}>Mock Context:</span>
                  <div style={styles.panelButtonGroup}>
                    <button
                      onClick={() => forceMockContext('supported-browser')}
                      style={
                        context === 'supported-browser'
                          ? styles.panelButtonActive
                          : styles.panelButton
                      }
                      id="mock-supported-btn"
                    >
                      Browser
                    </button>
                    <button
                      onClick={() => forceMockContext('suspected-in-app-browser')}
                      style={
                        context === 'suspected-in-app-browser'
                          ? styles.panelButtonActive
                          : styles.panelButton
                      }
                      id="mock-inapp-btn"
                    >
                      In-App
                    </button>
                    <button
                      onClick={() => forceMockContext('installed-pwa')}
                      style={
                        context === 'installed-pwa' ? styles.panelButtonActive : styles.panelButton
                      }
                      id="mock-standalone-btn"
                    >
                      PWA
                    </button>
                  </div>
                </div>

                <div style={styles.panelRow}>
                  <span style={styles.panelLabel}>Mock Storage Block:</span>
                  <button
                    onClick={() => forceMockIdentityBlock(!mockBlocked)}
                    style={mockBlocked ? styles.panelButtonActive : styles.panelButton}
                    id="toggle-mock-indexeddb-btn"
                  >
                    {mockBlocked ? 'BLOCKED' : 'ALLOW'}
                  </button>
                </div>

                <div style={styles.panelRow}>
                  <span style={styles.panelLabel}>SW Update:</span>
                  <div style={styles.panelStatusGroup}>
                    <span style={styles.panelValue} id="sw-status-label">
                      {isUpdateAvailable
                        ? updateDeferred
                          ? 'Deferred (In Match)'
                          : 'Available'
                        : 'Up to Date'}
                    </span>
                    <button
                      onClick={simulateMockUpdate}
                      style={styles.panelActionBtn}
                      id="mock-sw-update-btn"
                    >
                      Simulate Update
                    </button>
                  </div>
                </div>

                {isUpdateAvailable && (
                  <div style={styles.panelRow}>
                    <span style={styles.panelLabel}>Action:</span>
                    <button
                      onClick={triggerUpdate}
                      style={styles.updateActionBtn}
                      id="trigger-sw-update-btn"
                    >
                      Reload & Apply Update
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <p>© 2026 BoardLink. No tracking or third-party cookies.</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <BrowserContextProvider>
        <IdentityContextProvider>
          <PwaManagerProvider>
            <TabLeaderElectionProvider>
              <AppContent />
            </TabLeaderElectionProvider>
          </PwaManagerProvider>
        </IdentityContextProvider>
      </BrowserContextProvider>
    </I18nProvider>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(circle at center, #1b2030 0%, #0d0f17 100%)',
    color: '#e2e8f0',
    fontFamily: '"Outfit", "Inter", sans-serif',
    padding: '2rem',
    margin: 0,
  },
  errorBanner: {
    width: '100%',
    maxWidth: '520px',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '1rem',
    padding: '1rem 1.25rem',
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    boxShadow: '0 8px 32px rgba(239, 68, 68, 0.1)',
  },
  bannerIcon: {
    fontSize: '1.25rem',
  },
  bannerText: {
    fontSize: '0.85rem',
    color: '#fca5a5',
    lineHeight: 1.4,
  },
  main: {
    width: '100%',
    maxWidth: '520px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2.5rem',
  },
  topbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    marginBottom: '-1rem',
  },
  settingsToggle: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#cbd5e1',
    borderRadius: '0.6rem',
    padding: '0.4rem 0.8rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  settingsTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#a855f7',
    margin: 0,
  },
  header: {
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '3.5rem',
    fontWeight: 800,
    letterSpacing: '-0.05em',
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: '0 0 0.5rem 0',
    cursor: 'pointer',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#94a3b8',
    margin: 0,
  },
  card: {
    background: 'rgba(30, 41, 59, 0.4)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '2rem',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
  },
  sectionHeader: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: 0,
    color: '#f8fafc',
  },
  profileDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.85rem',
  },
  profileRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileName: {
    fontWeight: 700,
    color: '#6366f1',
    fontSize: '0.95rem',
  },
  profileId: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: '#cbd5e1',
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  divider: {
    height: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    margin: '0.5rem 0',
  },
  friendCodeSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  codeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(99, 102, 241, 0.05)',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(99, 102, 241, 0.15)',
  },
  codeValue: {
    fontSize: '1.2rem',
    fontWeight: 800,
    color: '#818cf8',
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
  },
  codeActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#f1f5f9',
    borderRadius: '0.35rem',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  revokeButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    color: '#fca5a5',
    borderRadius: '0.35rem',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  issueButton: {
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  resetButton: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '0.5rem',
    padding: '0.5rem 1rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    width: '100%',
    marginTop: '0.5rem',
  },
  lookupInputRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '0.5rem',
    color: '#f8fafc',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
  },
  successResult: {
    background: 'rgba(16, 185, 129, 0.05)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  resultLabel: {
    fontSize: '0.75rem',
    color: '#10b981',
    fontWeight: 600,
  },
  resultName: {
    fontSize: '0.95rem',
    color: '#f1f5f9',
  },
  resultId: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
  },
  errorResult: {
    fontSize: '0.85rem',
    color: '#fca5a5',
    textAlign: 'center' as const,
    background: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    padding: '0.5rem',
    borderRadius: '0.5rem',
  },
  description: {
    fontSize: '0.9rem',
    color: '#94a3b8',
    lineHeight: 1.5,
    margin: 0,
  },
  statusGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.85rem',
  },
  statusItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '0.75rem',
    border: '1px solid rgba(255, 255, 255, 0.02)',
  },
  label: {
    color: '#94a3b8',
    fontSize: '0.85rem',
  },
  value: {
    fontWeight: 500,
    color: '#f1f5f9',
    fontSize: '0.85rem',
  },
  badgeLeader: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '0.25rem 0.75rem',
    borderRadius: '1rem',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  badgeFollower: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '0.25rem 0.75rem',
    borderRadius: '1rem',
    border: '1px solid rgba(245, 158, 11, 0.2)',
  },
  badgeLock: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#ef4444',
    background: 'rgba(239, 68, 68, 0.1)',
    padding: '0.25rem 0.75rem',
    borderRadius: '1rem',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  roomStatus: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(239, 68, 68, 0.05)',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(239, 68, 68, 0.1)',
  },
  tokenContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(168, 85, 247, 0.05)',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(168, 85, 247, 0.1)',
  },
  tokenValue: {
    fontWeight: 700,
    color: '#a855f7',
    fontFamily: 'monospace',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'background-color 0.2s',
  },
  backButton: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#f8fafc',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'background-color 0.2s',
  },
  navGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  navButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '0.75rem',
    color: '#f1f5f9',
    padding: '0.75rem 1rem',
    textAlign: 'left' as const,
    fontWeight: 500,
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
  },
  testingPanel: {
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    borderRadius: '1.25rem',
    padding: '1.5rem',
    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.05)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  panelTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#a855f7',
    margin: 0,
  },
  panelGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  panelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  },
  panelLabel: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    fontWeight: 500,
  },
  panelValue: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#cbd5e1',
  },
  panelButtonGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  panelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '0.5rem',
    color: '#94a3b8',
    padding: '0.35rem 0.75rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  panelButtonActive: {
    backgroundColor: '#6366f1',
    border: '1px solid #6366f1',
    borderRadius: '0.5rem',
    color: '#ffffff',
    padding: '0.35rem 0.75rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: '0 0 12px rgba(99, 102, 241, 0.3)',
  },
  panelStatusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  panelActionBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    border: '1px solid rgba(168, 85, 247, 0.2)',
    borderRadius: '0.5rem',
    color: '#a855f7',
    padding: '0.35rem 0.75rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  updateActionBtn: {
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#ffffff',
    padding: '0.4rem 1rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
    transition: 'background-color 0.2s',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '2rem',
    fontSize: '0.8rem',
    color: '#64748b',
    textAlign: 'center' as const,
  },
};
