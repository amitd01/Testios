import React from 'react';
import BriefingStatus from './BriefingStatus';

const COLUMNS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'screened', label: 'Screened' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'sent_to_manager', label: 'Sent to Manager' },
  { key: 'interview_scheduled', label: 'Interview' },
  { key: 'hired', label: 'Hired' },
];

function PipelineKanban({ submissions, onAdvance, onReject }) {
  const grouped = {};
  COLUMNS.forEach(c => { grouped[c.key] = []; });
  grouped['rejected'] = [];

  submissions.forEach(s => {
    if (grouped[s.status]) grouped[s.status].push(s);
  });

  return (
    <div className="pipeline-board">
      {COLUMNS.map(col => (
        <div key={col.key} className="pipeline-column">
          <h4>{col.label} ({grouped[col.key].length})</h4>
          {grouped[col.key].map(sub => (
            <div key={sub.id} className="pipeline-card">
              <strong>{sub.candidate_name}</strong>
              <div style={{ fontSize: 11, color: '#636e72', marginTop: 2 }}>
                {sub.consultant_firm || 'Direct'}
              </div>
              {sub.fit_score != null && (
                <div style={{ marginTop: 4 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: sub.fit_score >= 70 ? '#e8f5e9' : sub.fit_score >= 40 ? '#fff8e1' : '#fce4ec',
                    color: sub.fit_score >= 70 ? '#2e7d32' : sub.fit_score >= 40 ? '#f57f17' : '#c62828',
                  }}>
                    Fit: {sub.fit_score}/100
                  </span>
                </div>
              )}
              {sub.briefing_status && (
                <div style={{ marginTop: 4 }}>
                  <BriefingStatus status={sub.briefing_status} />
                </div>
              )}
              <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                {col.key !== 'hired' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => onAdvance(sub.id)}>
                      Advance
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => onReject(sub.id)}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default PipelineKanban;
