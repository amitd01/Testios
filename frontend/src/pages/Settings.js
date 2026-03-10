import React, { useState } from 'react';
import api, { clearToken } from '../utils/api';
import { Card } from '../components/Card';

export default function Settings({ user, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.post('/api/sync/start');
      setSyncResult(result);
      if (onSync) onSync();
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (!window.confirm('This will permanently delete ALL your data and revoke Gmail access. This action cannot be undone. Continue?')) {
      return;
    }
    try {
      await api.post('/api/revoke');
      clearToken();
      window.location.href = '/';
    } catch (err) {
      alert('Failed to revoke access: ' + err.message);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Gmail Connection */}
      <Card title="Gmail Connection" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{user?.email}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {user?.gmailConnected ? 'Connected' : 'Not connected'}
            </div>
          </div>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: user?.gmailConnected ? 'var(--accent-green)' : 'var(--accent-red)',
          }} />
        </div>
        {user?.lastSync && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Last synced: {new Date(user.lastSync).toLocaleString('en-IN')}
          </div>
        )}
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing} style={{ marginRight: 8 }}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        {syncResult && (
          <div style={{ marginTop: 12, fontSize: 13, color: syncResult.error ? 'var(--accent-red)' : 'var(--accent-green)' }}>
            {syncResult.error || `Sync complete: ${syncResult.stats?.fetched || 0} emails processed, ${syncResult.stats?.parsed || 0} parsed`}
          </div>
        )}
      </Card>

      {/* Email Processing */}
      <Card title="Email Processing" style={{ marginBottom: 20 }}>
        <div style={styles.settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>Sync Frequency</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>How often to check for new financial emails</div>
          </div>
          <select defaultValue="hourly" style={{ minWidth: 120 }}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="manual">Manual only</option>
          </select>
        </div>
      </Card>

      {/* Supported Senders */}
      <Card title="Email Sender Whitelist" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Only emails from these institutional domains are processed. Personal emails are never accessed.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['hdfcbank.net', 'icicibank.com', 'sbi.co.in', 'axisbank.com', 'kotak.com',
            'phonepe.com', 'paytm.com', 'bescom.co.in', 'airtel.in', 'camsonline.com',
            'netflix.com', 'sbicard.com'].map(domain => (
            <span key={domain} style={styles.domainChip}>{domain}</span>
          ))}
          <span style={{ ...styles.domainChip, color: 'var(--accent-blue)', cursor: 'pointer' }}>+ more</span>
        </div>
      </Card>

      {/* Data Export */}
      <Card title="Export Data" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Download your financial data in CSV format
        </p>
        <button className="btn btn-secondary">Export Transactions (CSV)</button>
      </Card>

      {/* Danger Zone */}
      <Card title="Danger Zone">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Permanently delete all your data and revoke Gmail access. This cannot be undone.
        </p>
        <button className="btn btn-danger" onClick={handleRevokeAccess}>
          Delete All Data & Revoke Access
        </button>
      </Card>
    </div>
  );
}

const styles = {
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
  },
  domainChip: {
    padding: '4px 10px',
    background: 'var(--bg-elevated)',
    borderRadius: 20,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
};
