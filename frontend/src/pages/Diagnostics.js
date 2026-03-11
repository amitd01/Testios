import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function Diagnostics() {
  const [tab, setTab] = useState('runs');
  const [syncRuns, setSyncRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [senders, setSenders] = useState([]);
  const [pendingSenders, setPendingSenders] = useState([]);
  const [parsers, setParsers] = useState([]);
  const [senderDomains, setSenderDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'runs') {
        const [runsData, statsData] = await Promise.all([
          api.get('/api/diagnostics/sync-runs'),
          api.get('/api/diagnostics/stats'),
        ]);
        setSyncRuns(runsData.runs);
        setStats(statsData);
      } else if (tab === 'senders') {
        const [senderStats, domainData, pendingData] = await Promise.all([
          api.get('/api/diagnostics/senders'),
          api.get('/api/admin/senders'),
          api.get('/api/admin/senders/pending'),
        ]);
        setSenders(senderStats.senders);
        setSenderDomains(domainData.senders);
        setPendingSenders(pendingData.pending);
      } else if (tab === 'parsers') {
        const data = await api.get('/api/diagnostics/parser-performance');
        setParsers(data.parsers);
      }
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    } finally {
      setLoading(false);
    }
  };

  const approveSender = async (id) => {
    const name = prompt('Institution name:');
    const type = prompt('Type (bank/credit_card/upi/biller/investment):');
    if (!name || !type) return;
    try {
      await api.post(`/api/admin/senders/pending/${id}/approve`, { institutionName: name, institutionType: type });
      loadData();
    } catch (err) {
      alert('Failed to approve: ' + err.message);
    }
  };

  const addNewSender = async () => {
    const domain = prompt('Domain (e.g., newbank.com):');
    const name = prompt('Institution name:');
    const type = prompt('Type (bank/credit_card/upi/biller/investment):');
    if (!domain || !name || !type) return;
    try {
      await api.post('/api/admin/senders', { domain, institutionName: name, institutionType: type });
      loadData();
    } catch (err) {
      alert('Failed to add: ' + err.message);
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  const statusColor = (status) => {
    if (status === 'completed') return '#10b981';
    if (status === 'failed') return '#ef4444';
    if (status === 'running') return '#f59e0b';
    return '#6b7280';
  };

  return (
    <div>
      {/* Tab bar */}
      <div style={styles.tabs}>
        {['runs', 'senders', 'parsers'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}>
            {t === 'runs' ? 'Sync Runs' : t === 'senders' ? 'Senders' : 'Parser Performance'}
          </button>
        ))}
      </div>

      {loading ? <div style={styles.loading}>Loading...</div> : (
        <>
          {/* Aggregate stats */}
          {tab === 'runs' && stats && (
            <div style={styles.statsRow}>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{stats.aggregate?.total || 0}</div>
                <div style={styles.statLabel}>Total Emails</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: '#10b981' }}>{stats.aggregate?.success || 0}</div>
                <div style={styles.statLabel}>Parsed</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: '#ef4444' }}>{stats.aggregate?.failed || 0}</div>
                <div style={styles.statLabel}>Failed</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{Math.round(stats.aggregate?.avg_confidence || 0)}</div>
                <div style={styles.statLabel}>Avg Confidence</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{formatDuration(Math.round(stats.aggregate?.avg_processing_ms || 0))}</div>
                <div style={styles.statLabel}>Avg Parse Time</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{stats.aggregate?.llm_used_count || 0}</div>
                <div style={styles.statLabel}>LLM Calls</div>
              </div>
            </div>
          )}

          {/* Error breakdown */}
          {tab === 'runs' && stats?.errors?.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Error Breakdown</h3>
              <div style={styles.errorGrid}>
                {stats.errors.map(e => (
                  <div key={e.error_type} style={styles.errorChip}>
                    <span style={styles.errorType}>{e.error_type}</span>
                    <span style={styles.errorCount}>{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync runs table */}
          {tab === 'runs' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Sync Runs</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Duration</th>
                    <th style={styles.th}>Emails</th>
                    <th style={styles.th}>Parsed</th>
                    <th style={styles.th}>Failed</th>
                    <th style={styles.th}>Transactions</th>
                    <th style={styles.th}>LLM</th>
                  </tr>
                </thead>
                <tbody>
                  {syncRuns.map(run => (
                    <tr key={run.id} onClick={() => navigate(`/diagnostics/run/${run.id}`)} style={styles.clickableRow}>
                      <td style={styles.td}>{formatTime(run.started_at)}</td>
                      <td style={styles.td}>{run.run_type}</td>
                      <td style={styles.td}><span style={{ color: statusColor(run.status) }}>{run.status}</span></td>
                      <td style={styles.td}>{formatDuration(run.duration_ms)}</td>
                      <td style={styles.td}>{run.emails_found || 0}</td>
                      <td style={styles.td}>{run.emails_parsed || 0}</td>
                      <td style={{ ...styles.td, color: run.emails_failed > 0 ? '#ef4444' : 'inherit' }}>{run.emails_failed || 0}</td>
                      <td style={styles.td}>{run.transactions_extracted || 0}</td>
                      <td style={styles.td}>{run.llm_calls || 0} calls</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {syncRuns.length === 0 && <div style={styles.empty}>No sync runs yet. Trigger a sync to get started.</div>}
            </div>
          )}

          {/* Senders tab */}
          {tab === 'senders' && (
            <>
              {/* Pending senders */}
              {pendingSenders.length > 0 && (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Pending Senders (Auto-Detected)</h3>
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Domain</th><th style={styles.th}>Sample Subject</th><th style={styles.th}>Count</th><th style={styles.th}>Action</th></tr></thead>
                    <tbody>
                      {pendingSenders.map(p => (
                        <tr key={p.id}>
                          <td style={styles.td}>{p.domain}</td>
                          <td style={styles.td}>{p.sample_subject}</td>
                          <td style={styles.td}>{p.occurrence_count}</td>
                          <td style={styles.td}><button onClick={() => approveSender(p.id)} style={styles.btnSmall}>Approve</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sender performance */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Sender Performance</h3>
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Domain</th><th style={styles.th}>Emails</th><th style={styles.th}>Success</th><th style={styles.th}>Avg Confidence</th><th style={styles.th}>Avg Time</th></tr></thead>
                  <tbody>
                    {senders.map(s => (
                      <tr key={s.domain}>
                        <td style={styles.td}>{s.domain}</td>
                        <td style={styles.td}>{s.total}</td>
                        <td style={styles.td}>{s.success}</td>
                        <td style={styles.td}>{Math.round(s.avg_confidence || 0)}</td>
                        <td style={styles.td}>{formatDuration(Math.round(s.avg_time_ms || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Managed senders */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  Managed Sender Domains
                  <button onClick={addNewSender} style={{ ...styles.btnSmall, marginLeft: 12 }}>+ Add</button>
                </h3>
                <div style={styles.chipGrid}>
                  {senderDomains.map(d => (
                    <div key={d.id} style={{ ...styles.senderChip, opacity: d.is_active ? 1 : 0.5 }}>
                      <span>{d.domain}</span>
                      <span style={styles.chipType}>{d.institution_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Parser performance tab */}
          {tab === 'parsers' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Parser Performance</h3>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Parser</th><th style={styles.th}>Total</th><th style={styles.th}>Success</th><th style={styles.th}>Success %</th><th style={styles.th}>Avg Confidence</th><th style={styles.th}>Avg Time</th><th style={styles.th}>LLM Fallbacks</th></tr></thead>
                <tbody>
                  {parsers.map(p => (
                    <tr key={p.parser_used}>
                      <td style={styles.td}>{p.parser_used}</td>
                      <td style={styles.td}>{p.total}</td>
                      <td style={styles.td}>{p.success}</td>
                      <td style={styles.td}>{p.total > 0 ? Math.round((p.success / p.total) * 100) : 0}%</td>
                      <td style={styles.td}>{Math.round(p.avg_confidence || 0)}</td>
                      <td style={styles.td}>{formatDuration(Math.round(p.avg_time_ms || 0))}</td>
                      <td style={styles.td}>{p.llm_fallback_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsers.length === 0 && <div style={styles.empty}>No parser data yet.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #334155' },
  tab: { padding: '10px 20px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, borderBottom: '2px solid transparent' },
  tabActive: { color: '#60a5fa', borderBottom: '2px solid #60a5fa' },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 },
  statCard: { background: '#1e293b', borderRadius: 8, padding: 16, textAlign: 'center' },
  statValue: { fontSize: 24, fontWeight: 700, color: '#f1f5f9' },
  statLabel: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#f1f5f9', fontSize: 16, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px', color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 500 },
  td: { padding: '8px 12px', borderBottom: '1px solid #1e293b', color: '#e2e8f0' },
  clickableRow: { cursor: 'pointer' },
  empty: { textAlign: 'center', color: '#64748b', padding: 24 },
  errorGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  errorChip: { display: 'flex', gap: 8, alignItems: 'center', background: '#1e293b', borderRadius: 6, padding: '6px 12px' },
  errorType: { color: '#f87171', fontSize: 12 },
  errorCount: { color: '#f1f5f9', fontWeight: 600 },
  btnSmall: { padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  chipGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  senderChip: { background: '#1e293b', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#e2e8f0', display: 'flex', gap: 8, alignItems: 'center' },
  chipType: { color: '#60a5fa', fontSize: 10, textTransform: 'uppercase' },
};
