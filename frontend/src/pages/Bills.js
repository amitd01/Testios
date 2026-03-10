import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card } from '../components/Card';
import { formatINR, formatDate } from '../utils/format';

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, upcoming, paid

  useEffect(() => {
    fetchBills();
  }, [filter]);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const params = filter === 'upcoming' ? '?upcoming=true' : '';
      const data = await api.get(`/api/bills${params}`);
      let filtered = data.bills;
      if (filter === 'paid') filtered = filtered.filter(b => b.paid);
      setBills(filtered);
    } catch (err) {
      console.error('Failed to fetch bills:', err);
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (billId) => {
    try {
      await api.patch(`/api/bills/${billId}/pay`, {});
      fetchBills();
    } catch (err) {
      console.error('Failed to mark bill as paid:', err);
    }
  };

  const getBillTypeIcon = (type) => {
    const icons = {
      electricity: '⚡', gas: '🔥', water: '💧', mobile: '📱',
      broadband: '🌐', dth: '📺', insurance: '🛡', subscription: '📺',
      loan_emi: '🏦', rent: '🏠', utility: '🔌', other: '📄',
    };
    return icons[type] || '📄';
  };

  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  if (loading) return <div className="loading">Loading bills...</div>;

  return (
    <div>
      {/* Filter Tabs */}
      <div style={styles.tabs}>
        {['all', 'upcoming', 'paid'].map(f => (
          <button
            key={f}
            style={{ ...styles.tab, ...(filter === f ? styles.tabActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {bills.length === 0 ? (
        <div className="empty-state">
          <h3>No bills found</h3>
          <p>Bill reminders from your email will appear here</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bills.map(bill => (
            <Card key={bill.id}>
              <div style={styles.billRow}>
                <div style={styles.billIcon}>{getBillTypeIcon(bill.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{bill.biller}</span>
                    <span style={styles.typeBadge}>{bill.type}</span>
                    {bill.recurrence && <span style={styles.recurrenceBadge}>{bill.recurrence}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                    {bill.accountNumber && <span>A/C: {bill.accountNumber}</span>}
                    {bill.dueDate && (
                      <span style={{ color: isOverdue(bill.dueDate) && !bill.paid ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                        Due: {formatDate(bill.dueDate)}
                        {isOverdue(bill.dueDate) && !bill.paid && ' (Overdue!)'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                    {bill.amount ? formatINR(bill.amount) : 'Amount TBD'}
                  </div>
                  {bill.paid ? (
                    <span className="badge badge-verified">Paid {bill.paidAt ? formatDate(bill.paidAt) : ''}</span>
                  ) : (
                    <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => markPaid(bill.id)}>
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: {
    padding: '8px 16px', borderRadius: 8, background: 'var(--bg-surface)',
    color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
  },
  tabActive: { background: 'var(--accent-blue)', color: 'white', borderColor: 'var(--accent-blue)' },
  billRow: { display: 'flex', alignItems: 'center', gap: 16 },
  billIcon: { fontSize: 28, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 12 },
  typeBadge: { padding: '2px 8px', borderRadius: 12, background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' },
  recurrenceBadge: { padding: '2px 8px', borderRadius: 12, background: 'rgba(79,142,247,0.1)', fontSize: 11, color: 'var(--accent-blue)', textTransform: 'capitalize' },
};
