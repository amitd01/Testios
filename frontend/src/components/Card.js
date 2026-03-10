import React from 'react';

export function Card({ title, children, className = '', action }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          {title && <div className="card-title">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ title, value, subtitle, trend, trendType = 'neutral' }) {
  const trendColors = { up: 'var(--accent-green)', down: 'var(--accent-red)', neutral: 'var(--text-muted)' };
  return (
    <Card title={title}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      {subtitle && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</div>}
      {trend && (
        <div style={{ fontSize: 12, color: trendColors[trendType], marginTop: 4, fontWeight: 600 }}>
          {trendType === 'up' ? '↑' : trendType === 'down' ? '↓' : ''} {trend}
        </div>
      )}
    </Card>
  );
}

export function ProgressBar({ value, max, color = 'var(--accent-blue)', height = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: '100%', height, background: 'var(--bg-elevated)', borderRadius: height / 2 }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: pct > 90 ? 'var(--accent-red)' : pct > 70 ? 'var(--accent-amber)' : color,
          borderRadius: height / 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}
