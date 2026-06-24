import React, { useState } from 'react';
import { useBrowserContext } from '../browser-context/BrowserContext.js';

interface InAppGateProps {
  routePath: string;
}

export const InAppGate: React.FC<InAppGateProps> = ({ routePath }) => {
  const { isAndroid, isIOS, getAndroidIntentUrl, copyUrlToClipboard } = useBrowserContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyUrlToClipboard();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={styles.overlay} id="in-app-gate">
      <div style={styles.card}>
        <div style={styles.warningIcon}>⚠️</div>
        <h2 style={styles.title}>In-App Browser Blocked</h2>
        <p style={styles.description}>
          Multiplayer matches are not supported inside KakaoTalk, Instagram, or Facebook webviews
          due to connection constraints. Please open this page in your default system browser to
          continue.
        </p>

        <div style={styles.routeContainer}>
          <span style={styles.routeLabel}>Deep Link:</span>
          <span style={styles.routeValue} id="deep-link-value">
            {routePath}
          </span>
        </div>

        <div style={styles.actions}>
          {isAndroid && (
            <a
              href={getAndroidIntentUrl()}
              style={styles.primaryButton}
              id="android-handoff-button"
            >
              Open in System Browser
            </a>
          )}

          {isIOS && (
            <div style={styles.iosContainer} id="ios-handoff-guide">
              <p style={styles.iosInstruction}>
                Tap the menu icon (<strong>···</strong> or <strong>Share</strong>) in the corner and
                select <strong>"Open in Safari"</strong>.
              </p>
            </div>
          )}

          <button onClick={handleCopy} style={styles.secondaryButton} id="copy-link-button">
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 15, 23, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '1rem',
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    maxWidth: '440px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  },
  warningIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 1rem 0',
  },
  description: {
    fontSize: '0.95rem',
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: '0 0 1.5rem 0',
  },
  routeContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    fontSize: '0.85rem',
    border: '1px solid rgba(255, 255, 255, 0.03)',
  },
  routeLabel: {
    color: '#64748b',
  },
  routeValue: {
    color: '#a855f7',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  primaryButton: {
    display: 'block',
    backgroundColor: '#6366f1',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.95rem',
    transition: 'background-color 0.2s',
  },
  iosContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    padding: '1rem',
    borderRadius: '0.75rem',
    textAlign: 'left' as const,
    marginBottom: '0.5rem',
  },
  iosInstruction: {
    fontSize: '0.85rem',
    color: '#cbd5e1',
    lineHeight: 1.5,
    margin: 0,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#f8fafc',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
  },
};
