import React from 'react';
import { useApi } from '../hooks/useApi';
import { Card } from '../components/Card';

export default function Insights() {
  const { data, loading } = useApi('/api/insights');

  if (loading) return <div className="loading">Generating insights...</div>;

  const insights = data?.insights || [];

  const getSeverityStyle = (severity) => {
    const styles = {
      error: { borderColor: 'var(--accent-red)', bg: 'rgba(247,111,111,0.05)' },
      warning: { borderColor: 'var(--accent-amber)', bg: 'rgba(247,168,79,0.05)' },
      success: { borderColor: 'var(--accent-green)', bg: 'rgba(45,216,130,0.05)' },
      info: { borderColor: 'var(--accent-blue)', bg: 'rgba(79,142,247,0.05)' },
    };
    return styles[severity] || styles.info;
  };

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        AI-generated insights based on your email financial data patterns
      </p>

      {insights.length === 0 ? (
        <div className="empty-state">
          <h3>No insights yet</h3>
          <p>Insights will be generated as more financial data is processed from your emails</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {insights.map((insight, i) => {
            const style = getSeverityStyle(insight.severity);
            return (
              <div key={i} style={{
                background: style.bg,
                border: `1px solid ${style.borderColor}`,
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: 28 }}>{insight.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{insight.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {insight.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textTransform: 'uppercase' }}>
                    {insight.type.replace('_', ' ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
