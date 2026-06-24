import React from 'react';
import { usePwaManager } from '../pwa/PwaManager.js';
import { useBrowserContext } from '../browser-context/BrowserContext.js';

export const InstallBanner: React.FC = () => {
  const { showInstallBanner, triggerInstall, dismissInstallBanner } = usePwaManager();
  const { context, isIOSSafari } = useBrowserContext();

  // If in installed mode, never show banner
  if (context === 'installed-pwa' || !showInstallBanner) {
    return null;
  }

  return (
    <div style={styles.banner} id="pwa-install-banner">
      <div style={styles.content}>
        <span style={styles.logo}>🎮</span>
        <div style={styles.textContainer}>
          <h4 style={styles.title}>Install BoardLink</h4>
          <p style={styles.subtitle}>Install our app for offline support and faster loading!</p>
        </div>
      </div>

      <div style={styles.actions}>
        {isIOSSafari ? (
          <div style={styles.iosInstructions} id="ios-install-guide">
            Tap <strong style={styles.shareText}>Share</strong> then{' '}
            <strong>Add to Home Screen</strong>
          </div>
        ) : (
          <button onClick={triggerInstall} style={styles.installButton} id="install-action-button">
            Install
          </button>
        )}

        <button
          onClick={dismissInstallBanner}
          style={styles.closeButton}
          id="dismiss-banner-button"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const styles = {
  banner: {
    position: 'fixed' as const,
    bottom: '1.5rem',
    left: '1.5rem',
    right: '1.5rem',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1rem',
    padding: '1rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '1rem',
    zIndex: 999,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    maxWidth: '560px',
    margin: '0 auto',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  logo: {
    fontSize: '2rem',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    margin: '0.25rem 0 0 0',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  installButton: {
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    padding: '0.5rem 1.25rem',
    borderRadius: '0.5rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  iosInstructions: {
    fontSize: '0.8rem',
    color: '#cbd5e1',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  shareText: {
    color: '#6366f1',
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#64748b',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
};
