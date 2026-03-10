import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useApi } from '../hooks/useApi';
import { Card, StatCard, ProgressBar } from '../components/Card';
import { formatINR, formatINRShort, formatDate, getCategoryColor } from '../utils/format';

export default function Dashboard() {
  const { data, loading, error } = useApi('/api/dashboard');

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="empty-state"><h3>Could not load dashboard</h3><p>{error}</p></div>;
  if (!data) return null;

  const { netWorth, cashFlow, spendingBreakdown, goals, investments, upcomingBills, nudges, recentTransactions, emailSync } = data;

  return (
    <div>
      {/* Nudge Bar */}
      {nudges && nudges.length > 0 && (
        <div style={styles.nudgeBar}>
          {nudges.map((n, i) => (
            <div key={i} style={{ ...styles.nudge, borderColor: n.type === 'warning' ? 'var(--accent-amber)' : n.type === 'success' ? 'var(--accent-green)' : 'var(--accent-blue)' }}>
              <span style={styles.nudgeIcon}>{n.icon}</span>
              <div>
                <div style={styles.nudgeTitle}>{n.title}</div>
                <div style={styles.nudgeMsg}>{n.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard
          title="Net Worth"
          value={formatINRShort(netWorth.total)}
          subtitle={`Banks: ${formatINRShort(netWorth.bankBalance)} | Investments: ${formatINRShort(netWorth.investments)}`}
        />
        <StatCard
          title="Income This Month"
          value={formatINR(cashFlow.income)}
          trend={cashFlow.lastMonthIncome > 0 ? `vs ${formatINRShort(cashFlow.lastMonthIncome)} last month` : null}
          trendType="neutral"
        />
        <StatCard
          title="Spending This Month"
          value={formatINR(cashFlow.spending)}
          trend={cashFlow.lastMonthSpending > 0 ? `vs ${formatINRShort(cashFlow.lastMonthSpending)} last month` : null}
          trendType={cashFlow.spending > cashFlow.lastMonthSpending ? 'down' : 'up'}
        />
        <StatCard
          title="Savings"
          value={formatINR(cashFlow.savings)}
          subtitle={cashFlow.income > 0 ? `${Math.round((cashFlow.savings / cashFlow.income) * 100)}% savings rate` : ''}
          trendType={cashFlow.savings > 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {/* Spending Breakdown */}
        <Card title="Spending Breakdown">
          {spendingBreakdown.categories.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 140, height: 140 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={spendingBreakdown.categories}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                    >
                      {spendingBreakdown.categories.map((entry, i) => (
                        <Cell key={i} fill={getCategoryColor(entry.category)} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                {spendingBreakdown.categories.slice(0, 5).map((cat, i) => (
                  <div key={i} style={styles.catRow}>
                    <span style={{ ...styles.catDot, background: getCategoryColor(cat.category) }} />
                    <span style={styles.catName}>{cat.category}</span>
                    <span style={styles.catAmount}>{formatINRShort(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state"><p>No spending data yet</p></div>
          )}
        </Card>

        {/* Goals Progress */}
        <Card title="Goals">
          {goals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {goals.map(goal => (
                <div key={goal.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{goal.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Math.round(goal.progress)}%</span>
                  </div>
                  <ProgressBar value={goal.current} max={goal.target} color="var(--accent-green)" />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {formatINRShort(goal.current)} / {formatINRShort(goal.target)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><p>No goals set. Create one to track your progress!</p></div>
          )}
        </Card>

        {/* Upcoming Bills */}
        <Card title="Upcoming Bills">
          {upcomingBills.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcomingBills.map(bill => (
                <div key={bill.id} style={styles.billRow}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{bill.biller}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Due: {formatDate(bill.dueDate)}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-amber)' }}>
                    {bill.amount ? formatINR(bill.amount) : 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><p>No upcoming bills</p></div>
          )}
        </Card>
      </div>

      <div className="grid-2">
        {/* Recent Transactions */}
        <Card title="Recent Transactions">
          {recentTransactions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentTransactions.map(txn => (
                <div key={txn.id} style={styles.txnRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{txn.merchant}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                      <span>{formatDate(txn.date)}</span>
                      <span>{txn.category}</span>
                      {txn.verified && <span className="badge badge-verified">Verified</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: txn.amount < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    {formatINR(txn.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><p>No transactions yet. Sync your Gmail to get started.</p></div>
          )}
        </Card>

        {/* Email Sync Stats */}
        <Card title="Email Sync Status">
          <div style={styles.syncGrid}>
            <div style={styles.syncStat}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)' }}>{emailSync.totalProcessed}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Emails</div>
            </div>
            <div style={styles.syncStat}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-green)' }}>{emailSync.successful}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Parsed</div>
            </div>
            <div style={styles.syncStat}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-red)' }}>{emailSync.failed}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Failed</div>
            </div>
            <div style={styles.syncStat}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-amber)' }}>{emailSync.pending}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending</div>
            </div>
          </div>
          {emailSync.totalProcessed > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Parse Rate</div>
              <ProgressBar
                value={emailSync.successful}
                max={emailSync.totalProcessed}
                color="var(--accent-green)"
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {Math.round((emailSync.successful / emailSync.totalProcessed) * 100)}% success rate
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const styles = {
  nudgeBar: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
    overflowX: 'auto',
    paddingBottom: 4,
  },
  nudge: {
    flex: '0 0 auto',
    display: 'flex',
    gap: 10,
    padding: '12px 16px',
    background: 'var(--bg-surface)',
    border: '1px solid',
    borderRadius: 12,
    minWidth: 240,
  },
  nudgeIcon: { fontSize: 20 },
  nudgeTitle: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
  nudgeMsg: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 },
  catRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  catDot: { width: 8, height: 8, borderRadius: '50%' },
  catName: { flex: 1, fontSize: 13, color: 'var(--text-secondary)' },
  catAmount: { fontSize: 13, fontWeight: 600 },
  billRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' },
  txnRow: { display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' },
  syncGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  syncStat: { textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 },
};
