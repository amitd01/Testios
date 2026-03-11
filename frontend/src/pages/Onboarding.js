import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);

  const startScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await api.post('/api/sync/onboarding', { days: 30 });
      setScanResult({ ...result.stats, reparsed: result.reparsed || false });
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const finishOnboarding = () => {
    navigate('/dashboard');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Progress */}
        <div style={styles.steps}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ ...styles.stepDot, background: s <= step ? 'var(--accent-blue)' : 'var(--bg-elevated)' }} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 style={styles.heading}>Gmail Connected!</h2>
            <p style={styles.desc}>
              We'll now scan your inbox to find financial emails from banks, credit cards, billers, and investment platforms.
            </p>
            <div style={styles.infoBox}>
              <p><strong>What we look for:</strong></p>
              <ul style={styles.list}>
                <li>Transaction alerts from banks (HDFC, ICICI, SBI, etc.)</li>
                <li>Credit card swipe notifications</li>
                <li>UPI payment confirmations (PhonePe, GPay, Paytm)</li>
                <li>PDF bank & credit card statements</li>
                <li>Bill payment reminders (electricity, mobile, subscriptions)</li>
                <li>Investment statements (MF CAS, demat)</li>
              </ul>
            </div>
            <button style={styles.cta} onClick={() => { setStep(2); startScan(); }}>
              Start Scanning
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={styles.heading}>Scanning Your Inbox...</h2>
            {scanning ? (
              <div style={styles.scanningBox}>
                <div style={styles.spinner} />
                <p style={{ color: 'var(--text-secondary)', marginTop: 16 }}>
                  Scanning emails from banks, credit cards, and billers...
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
                  This may take a minute for large inboxes
                </p>
              </div>
            ) : error ? (
              <div>
                <p style={{ color: 'var(--accent-red)', marginBottom: 16 }}>{error}</p>
                <button style={styles.cta} onClick={startScan}>Retry Scan</button>
              </div>
            ) : null}
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={styles.heading}>Scan Complete!</h2>
            <div style={styles.statsGrid}>
              <div style={styles.stat}>
                <div style={styles.statValue}>{scanResult?.fetched || scanResult?.parsed || 0}</div>
                <div style={styles.statLabel}>Emails Processed</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statValue}>{scanResult?.harmonized || scanResult?.transactions || scanResult?.parsed || 0}</div>
                <div style={styles.statLabel}>Transactions Found</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statValue}>{scanResult?.failed || 0}</div>
                <div style={styles.statLabel}>Failed</div>
              </div>
            </div>
            {scanResult?.reparsed && (
              <p style={{ color: 'var(--accent-blue)', fontSize: 13, marginBottom: 16 }}>
                Emails were already stored from a previous session. Re-parsed with latest logic.
              </p>
            )}
            {scanResult?.failed > 0 && (
              <p style={{ color: 'var(--accent-amber)', fontSize: 13, marginBottom: 16 }}>
                {scanResult.failed} emails could not be parsed. These will improve over time.
              </p>
            )}
            <button style={styles.cta} onClick={finishOnboarding}>
              Go to Dashboard
            </button>
          </>
        )}
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
    maxWidth: 520,
    width: '100%',
  },
  steps: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 32,
  },
  stepDot: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 12,
  },
  desc: {
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 24,
  },
  infoBox: {
    background: 'var(--bg-elevated)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  list: {
    paddingLeft: 18,
    marginTop: 6,
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
  },
  scanningBox: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '4px solid var(--bg-elevated)',
    borderTop: '4px solid var(--accent-blue)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 24,
  },
  stat: {
    textAlign: 'center',
    padding: 16,
    background: 'var(--bg-elevated)',
    borderRadius: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--accent-blue)',
  },
  statLabel: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
};
