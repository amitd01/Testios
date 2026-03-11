import React, { useState, useEffect } from 'react';
import api, { clearToken } from '../utils/api';
import { Card } from '../components/Card';

export default function Settings({ user, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [reparsing, setReparsing] = useState(false);
  const [reparseResult, setReparseResult] = useState(null);
  const [senders, setSenders] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSenders();
  }, []);

  const loadSenders = async () => {
    try {
      const data = await api.get('/api/admin/senders');
      setSenders(data.senders || []);
    } catch (err) {
      // Fall back to empty — diagnostics-level endpoint may not be accessible
      console.log('Could not load senders:', err.message);
    }
  };

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

  const handleReparse = async () => {
    if (!window.confirm('This will clear all existing transactions and re-parse every stored email with the latest parsing logic. Continue?')) {
      return;
    }
    setReparsing(true);
    setReparseResult(null);
    try {
      const result = await api.post('/api/sync/reparse');
      setReparseResult(result);
      if (onSync) onSync();
    } catch (err) {
      setReparseResult({ error: err.message });
    } finally {
      setReparsing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('pfm_token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/transactions/export`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transactions.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (!window.confirm('This will permanently delete ALL your data and revoke Gmail access. This action cannot be undone. Continue?')) {
      return;
    }
    try {
      await api.post('/api/revoke', null, { skipAuthRedirect: true });
    } catch (err) {
      if (!err.message.includes('Unauthorized') && !err.message.includes('401')) {
        alert('Failed to revoke access: ' + err.message);
        return;
      }
    }
    clearToken();
    window.location.href = '/';
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
            {syncResult.error || `Sync complete: ${syncResult.stats?.fetched || 0} emails processed, ${syncResult.stats?.parsed || 0} parsed, ${syncResult.stats?.harmonized || 0} transactions`}
          </div>
        )}
      </Card>

      {/* Email Processing */}
      <Card title="Email Processing" style={{ marginBottom: 20 }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Re-parse Emails</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Clear all transactions and re-process stored emails with the latest parsing logic.
            Does not re-fetch from Gmail.
          </div>
          <button className="btn btn-secondary" onClick={handleReparse} disabled={reparsing}>
            {reparsing ? 'Re-parsing...' : 'Re-parse All Emails'}
          </button>
          {reparseResult && (
            <div style={{ marginTop: 12, fontSize: 13, color: reparseResult.error ? 'var(--accent-red)' : 'var(--accent-green)' }}>
              {reparseResult.error || `Re-parse complete: ${reparseResult.stats?.parsed || 0} parsed, ${reparseResult.stats?.failed || 0} failed, ${reparseResult.stats?.harmonized || 0} transactions created`}
            </div>
          )}
        </div>
      </Card>

      {/* Supported Senders */}
      <Card title="Email Sender Whitelist" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Only emails from these institutional domains are processed. Personal emails are never accessed.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {senders.length > 0 ? (
            senders.map(s => (
              <span key={s.domain} style={styles.domainChip}>
                {s.domain}
                <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  ({s.institution_type || s.institutionType})
                </span>
              </span>
            ))
          ) : (
            ['hdfcbank.net', 'icicibank.com', 'sbi.co.in', 'axisbank.com', 'kotak.com',
             'phonepe.com', 'paytm.com', 'bescom.co.in', 'airtel.in', 'camsonline.com',
             'netflix.com', 'sbicard.com'].map(domain => (
              <span key={domain} style={styles.domainChip}>{domain}</span>
            ))
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          {senders.length > 0 ? `${senders.length} domains configured` : 'Loading from database...'}
        </div>
      </Card>

      {/* Data Export */}
      <Card title="Export Data" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Download your financial data in CSV format
        </p>
        <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export Transactions (CSV)'}
        </button>
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
