import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useApi } from '../hooks/useApi';
import { Card, StatCard } from '../components/Card';
import { formatINR, formatINRShort, formatDate, getCategoryColor } from '../utils/format';

const TYPE_COLORS = {
  mutual_fund: '#4F8EF7',
  stock: '#2DD882',
  bond: '#F7A84F',
  ppf: '#A78BFA',
  nps: '#F472B6',
};

export default function Investments() {
  const { data, loading, error } = useApi('/api/investments');

  if (loading) return <div className="loading">Loading investments...</div>;
  if (error) return <div className="empty-state"><h3>Error loading investments</h3><p>{error}</p></div>;

  const { investments = [], summary = {} } = data || {};
  const totalGain = (summary.totalValue || 0) - (summary.totalInvested || 0);
  const gainPct = summary.totalInvested > 0 ? ((totalGain / summary.totalInvested) * 100).toFixed(1) : 0;

  return (
    <div>
      {/* Summary */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard title="Portfolio Value" value={formatINRShort(summary.totalValue || 0)} />
        <StatCard title="Total Invested" value={formatINRShort(summary.totalInvested || 0)} />
        <StatCard
          title="Total Gain/Loss"
          value={formatINRShort(totalGain)}
          trend={`${gainPct}%`}
          trendType={totalGain >= 0 ? 'up' : 'down'}
        />
        <StatCard title="Holdings" value={investments.length.toString()} />
      </div>

      {/* Asset Allocation */}
      {summary.byType && summary.byType.length > 0 && (
        <Card title="Asset Allocation" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div style={{ width: 180, height: 180 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={summary.byType} dataKey="value" nameKey="type" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {summary.byType.map((entry, i) => (
                      <Cell key={i} fill={TYPE_COLORS[entry.type] || '#6B7280'} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              {summary.byType.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[t.type] || '#6B7280' }} />
                  <span style={{ flex: 1, textTransform: 'capitalize', fontSize: 14 }}>{t.type.replace('_', ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{formatINRShort(t.value)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({t.count} holdings)</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Holdings List */}
      {investments.length === 0 ? (
        <div className="empty-state">
          <h3>No investments found</h3>
          <p>Investment data will appear here once MF CAS or demat statements are processed from your email</p>
        </div>
      ) : (
        <Card title="Holdings">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={styles.th}>Scheme</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Units</th>
                <th style={styles.th}>NAV/Price</th>
                <th style={styles.th}>Invested</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Current Value</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Gain/Loss</th>
              </tr>
            </thead>
            <tbody>
              {investments.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 500 }}>{inv.schemeName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.institution}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ textTransform: 'capitalize', fontSize: 13 }}>{inv.type.replace('_', ' ')}</span>
                  </td>
                  <td style={styles.td}>{inv.units.toFixed(3)}</td>
                  <td style={styles.td}>{formatINR(inv.nav)}</td>
                  <td style={styles.td}>{formatINR(inv.investedValue)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{formatINR(inv.currentValue)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, color: inv.gain >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {formatINR(inv.gain)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const styles = {
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' },
  td: { padding: '12px 16px', fontSize: 14 },
};
