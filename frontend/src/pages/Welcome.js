import React from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const institutions = [
  'HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak Mahindra',
  'HDFC Card', 'ICICI Card', 'SBI Card',
  'PhonePe', 'Google Pay', 'Paytm',
  'BESCOM', 'MSEDCL', 'Airtel', 'Jio',
  'Netflix', 'Amazon Prime', 'Spotify',
  'CAMS (MF Central)', 'NSDL', 'CDSL', 'Zerodha', 'Groww',
];

export default function Welcome() {
  const handleGetStarted = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/google`);
      const data = await res.json();
      window.location.href = data.authUrl;
    } catch (err) {
      alert('Failed to start authentication. Make sure the backend is running.');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logo}>₹</div>
          <h1 style={styles.title}>Personal Finance Manager</h1>
        </div>
        <p style={styles.tagline}>
          Zero manual entry. Complete financial picture from your Gmail inbox.
        </p>

        <div style={styles.features}>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>📧</span>
            <div>
              <h3 style={styles.featureTitle}>Email-Powered</h3>
              <p style={styles.featureDesc}>Reads transaction alerts, statements, and bill reminders from your Gmail</p>
            </div>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>🔒</span>
            <div>
              <h3 style={styles.featureTitle}>Secure & Private</h3>
              <p style={styles.featureDesc}>Only reads emails from banks and billers. Personal emails are never accessed.</p>
            </div>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>📊</span>
            <div>
              <h3 style={styles.featureTitle}>Smart Insights</h3>
              <p style={styles.featureDesc}>Automatic categorization, deduplication, and spending analysis</p>
            </div>
          </div>
        </div>

        <div style={styles.institutions}>
          <p style={styles.supportedTitle}>Supported Institutions ({institutions.length}+)</p>
          <div style={styles.chips}>
            {institutions.map(name => (
              <span key={name} style={styles.chip}>{name}</span>
            ))}
          </div>
        </div>

        <button style={styles.cta} onClick={handleGetStarted}>
          Get Started with Gmail
        </button>
        <p style={styles.disclaimer}>
          By continuing, you agree to grant read-only access to your Gmail for financial data extraction only.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    padding: 20,
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: 20,
    padding: 48,
    maxWidth: 560,
    width: '100%',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  logo: {
    width: 48,
    height: 48,
    background: 'var(--accent-blue)',
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
  },
  tagline: {
    fontSize: 16,
    color: 'var(--text-secondary)',
    marginBottom: 32,
    lineHeight: 1.5,
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginBottom: 32,
  },
  feature: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
  },
  featureIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  institutions: {
    marginBottom: 32,
  },
  supportedTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    padding: '4px 10px',
    background: 'var(--bg-elevated)',
    borderRadius: 20,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  cta: {
    width: '100%',
    padding: '14px 24px',
    background: 'var(--accent-blue)',
    color: 'white',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 12,
  },
  disclaimer: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: 1.4,
  },
};
