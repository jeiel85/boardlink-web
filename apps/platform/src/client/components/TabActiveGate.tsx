import React from 'react';
import { useTabLeaderElection } from '../realtime/TabLeaderElection.js';

export const TabActiveGate: React.FC = () => {
  const { isLeader, claimTakeover } = useTabLeaderElection();

  if (isLeader) {
    return null;
  }

  return (
    <div style={styles.overlay} id="tab-active-gate">
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>🔏</span>
        </div>
        <h2 style={styles.title}>Inactive Tab</h2>
        <p style={styles.description}>
          BoardLink is already active in another browser tab. Real-time updates and multiplayer
          matches are restricted to a single active session to prevent out-of-sync state.
        </p>
        <button
          onClick={claimTakeover}
          style={styles.button}
          id="takeover-button"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(99, 102, 241, 0.4)';
            e.currentTarget.style.backgroundColor = '#4f46e5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.backgroundColor = '#6366f1';
          }}
        >
          Take Over Session
        </button>
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
    backgroundColor: 'rgba(9, 11, 18, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
    padding: '1.5rem',
  },
  card: {
    backgroundColor: 'rgba(23, 28, 41, 0.75)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
  },
  iconContainer: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1.5rem auto',
    border: '1px solid rgba(99, 102, 241, 0.2)',
  },
  icon: {
    fontSize: '2.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 1rem 0',
    fontFamily: '"Outfit", "Inter", sans-serif',
  },
  description: {
    fontSize: '0.95rem',
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: '0 0 2rem 0',
    fontFamily: '"Inter", sans-serif',
  },
  button: {
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    padding: '0.875rem 2rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: 'pointer',
    width: '100%',
    transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
  },
};
