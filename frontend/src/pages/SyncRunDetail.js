import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function SyncRunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [filter, setFilter] = useState({ status: '', parser: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [id, filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);

      const [runData, emailData] = await Promise.all([
        api.get(`/api/diagnostics/sync-runs/${id}`),
        api.get(`/api/diagnostics/sync-runs/${id}/emails?${params}`),
      ]);
      setRun(runData.run);
      setEmails(emailData.emails);
    } catch (err) {
      console.error('Failed to load run detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEmailDetail = async (emailId) => {
    try {
      const data = await api.get(`/api/diagnostics/email/${emailId}`);
      setSelectedEmail(data.email);
    } catch (err) {
      console.error('Failed to load email:', err);
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  const confidenceColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  if (loading) return <div style={styles.loading}>Loading...</div>;
  if (!run) return <div style={styles.loading}>Sync run not found</div>;

  const totalTime = run.duration_ms || 0;
  const gmailPct = totalTime > 0 ? Math.round((run.gmail_api_time_ms / totalTime) * 100) : 0;
  const parsePct = totalTime > 0 ? Math.round((run.parse_time_ms / totalTime) * 100) : 0;
  const otherPct = 100 - gmailPct - parsePct;

  return (
    <div>
      <button onClick={() => navigate('/diagnostics')} style={styles.backBtn}>Back to Diagnostics</button>

      {/* Summary cards */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardValue}>{formatDuration(run.duration_ms)}</div>
          <div style={styles.cardLabel}>Total Duration</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{run.emails_found || 0}</div>
          <div style={styles.cardLabel}>Emails Found</div>
        </div>
        <div style={styles.card}>
          <div style={{ ...styles.cardValue, color: '#10b981' }}>{run.emails_parsed || 0}</div>
          <div style={styles.cardLabel}>Parsed</div>
        </div>
        <div style={styles.card}>
          <div style={{ ...styles.cardValue, color: '#ef4444' }}>{run.emails_failed || 0}</div>
          <div style={styles.cardLabel}>Failed</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{run.emails_skipped || 0}</div>
          <div style={styles.cardLabel}>Skipped</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{run.transactions_extracted || 0}</div>
          <div style={styles.cardLabel}>Transactions</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{run.transactions_deduplicated || 0}</div>
          <div style={styles.cardLabel}>After Dedup</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{run.llm_calls || 0}</div>
          <div style={styles.cardLabel}>LLM Calls ({run.llm_tokens_total || 0} tokens)</div>
        </div>
      </div>

      {/* Timing breakdown */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Timing Breakdown</h3>
        <div style={styles.timingBar}>
          <div style={{ ...styles.timingSegment, width: `${gmailPct}%`, background: '#3b82f6' }} title={`Gmail API: ${formatDuration(run.gmail_api_time_ms)}`} />
          <div style={{ ...styles.timingSegment, width: `${parsePct}%`, background: '#10b981' }} title={`Parsing: ${formatDuration(run.parse_time_ms)}`} />
          <div style={{ ...styles.timingSegment, width: `${otherPct}%`, background: '#6b7280' }} title="Other (DB, dedup)" />
        </div>
        <div style={styles.timingLegend}>
          <span><span style={{ color: '#3b82f6' }}>Gmail API</span> {formatDuration(run.gmail_api_time_ms)} ({run.gmail_api_calls} calls)</span>
          <span><span style={{ color: '#10b981' }}>Parsing</span> {formatDuration(run.parse_time_ms)}</span>
          <span><span style={{ color: '#6b7280' }}>Other</span></span>
        </div>
      </div>

      {/* Error summary */}
      {run.error_summary && Object.keys(run.error_summary).length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Error Summary</h3>
          <div style={styles.errorGrid}>
            {Object.entries(run.error_summary).map(([type, count]) => (
              <div key={type} style={styles.errorChip}>
                <span style={styles.errorType}>{type}</span>
                <span style={styles.errorCount}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={styles.filters}>
        <select value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))} style={styles.select}>
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Emails table */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Emails ({emails.length})</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Sender</th>
              <th style={styles.th}>Subject</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Parser</th>
              <th style={styles.th}>LLM</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Confidence</th>
              <th style={styles.th}>Txns</th>
              <th style={styles.th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {emails.map(email => (
              <tr key={email.id} onClick={() => loadEmailDetail(email.id)} style={styles.clickableRow}>
                <td style={styles.td}>{(email.sender || '').split('@')[1] || email.sender}</td>
                <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</td>
                <td style={styles.td}><span style={styles.categoryBadge}>{email.email_category}</span></td>
                <td style={styles.td}><span style={{ color: email.parsing_status === 'success' ? '#10b981' : '#ef4444' }}>{email.parsing_status}</span></td>
                <td style={styles.td}>{email.parser_used || '-'}</td>
                <td style={styles.td}>{email.llm_used ? 'Yes' : '-'}</td>
                <td style={styles.td}>{formatDuration(email.processing_time_ms)}</td>
                <td style={styles.td}><span style={{ color: confidenceColor(email.confidence_score) }}>{Math.round(email.confidence_score || 0)}</span></td>
                <td style={styles.td}>{email.transactions_extracted || 0}</td>
                <td style={{ ...styles.td, color: '#f87171', fontSize: 11 }}>{email.error_type || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Email detail modal */}
      {selectedEmail && (
        <div style={styles.modal} onClick={() => setSelectedEmail(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button style={styles.closeBtn} onClick={() => setSelectedEmail(null)}>X</button>
            <h3 style={styles.modalTitle}>Email Detail</h3>
            <div style={styles.detailGrid}>
              <div><strong>Sender:</strong> {selectedEmail.sender}</div>
              <div><strong>Subject:</strong> {selectedEmail.subject}</div>
              <div><strong>Category:</strong> {selectedEmail.email_category}</div>
              <div><strong>Status:</strong> {selectedEmail.parsing_status}</div>
              <div><strong>Parser:</strong> {selectedEmail.parser_used || 'none'}</div>
              <div><strong>LLM Used:</strong> {selectedEmail.llm_used ? `Yes (${selectedEmail.llm_tokens_used} tokens)` : 'No'}</div>
              <div><strong>Processing Time:</strong> {formatDuration(selectedEmail.processing_time_ms)}</div>
              <div><strong>Confidence:</strong> <span style={{ color: confidenceColor(selectedEmail.confidence_score) }}>{Math.round(selectedEmail.confidence_score || 0)}</span></div>
              <div><strong>Transactions:</strong> {selectedEmail.transactions_extracted || 0}</div>
              <div><strong>Error Type:</strong> {selectedEmail.error_type || 'none'}</div>
              <div><strong>Received:</strong> {formatTime(selectedEmail.received_at)}</div>
            </div>
            {selectedEmail.parsing_errors && (
              <div style={styles.errorBox}>
                <strong>Error:</strong> {selectedEmail.parsing_errors}
              </div>
            )}
            {selectedEmail.processing_details && Object.keys(selectedEmail.processing_details).length > 0 && (
              <div style={styles.detailBox}>
                <strong>Processing Details:</strong>
                <pre style={styles.pre}>{JSON.stringify(selectedEmail.processing_details, null, 2)}</pre>
              </div>
            )}
            {selectedEmail.body_preview && (
              <div style={styles.detailBox}>
                <strong>Body Preview:</strong>
                <pre style={styles.pre}>{selectedEmail.body_preview}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  backBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', marginBottom: 16, fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 },
  card: { background: '#1e293b', borderRadius: 8, padding: 16, textAlign: 'center' },
  cardValue: { fontSize: 22, fontWeight: 700, color: '#f1f5f9' },
  cardLabel: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#f1f5f9', fontSize: 15, marginBottom: 12 },
  timingBar: { display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  timingSegment: { height: '100%', minWidth: 2 },
  timingLegend: { display: 'flex', gap: 20, fontSize: 12, color: '#94a3b8' },
  errorGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  errorChip: { display: 'flex', gap: 8, alignItems: 'center', background: '#1e293b', borderRadius: 6, padding: '6px 12px' },
  errorType: { color: '#f87171', fontSize: 12 },
  errorCount: { color: '#f1f5f9', fontWeight: 600 },
  filters: { display: 'flex', gap: 8, marginBottom: 16 },
  select: { background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '6px 12px', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '6px 10px', color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 500, fontSize: 11 },
  td: { padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#e2e8f0' },
  clickableRow: { cursor: 'pointer' },
  categoryBadge: { background: '#334155', padding: '2px 6px', borderRadius: 4, fontSize: 10 },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalContent: { background: '#0f172a', borderRadius: 12, padding: 24, maxWidth: 700, width: '90%', maxHeight: '80vh', overflow: 'auto', position: 'relative', border: '1px solid #334155' },
  closeBtn: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 },
  modalTitle: { color: '#f1f5f9', marginBottom: 16 },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13, color: '#e2e8f0', marginBottom: 16 },
  errorBox: { background: '#451a1a', padding: 12, borderRadius: 6, color: '#fca5a5', fontSize: 12, marginBottom: 12 },
  detailBox: { marginBottom: 12, fontSize: 12, color: '#e2e8f0' },
  pre: { background: '#1e293b', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 200, marginTop: 6, color: '#94a3b8' },
};
