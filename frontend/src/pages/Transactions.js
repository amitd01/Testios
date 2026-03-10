import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatINR, formatDate, getCategoryColor } from '../utils/format';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category: '', search: '', startDate: '', endDate: '' });
  const [offset, setOffset] = useState(0);
  const limit = 30;

  useEffect(() => {
    fetchTransactions();
  }, [offset, filters]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit, offset });
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const data = await api.get(`/api/transactions?${params}`);
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setOffset(0);
  };

  return (
    <div>
      {/* Filters */}
      <div style={styles.filters}>
        <input
          type="text"
          placeholder="Search merchant..."
          value={filters.search}
          onChange={e => handleFilterChange('search', e.target.value)}
          style={styles.searchInput}
        />
        <select
          value={filters.category}
          onChange={e => handleFilterChange('category', e.target.value)}
          style={styles.select}
        >
          <option value="">All Categories</option>
          {['Food & Dining', 'Transportation', 'Bills & Utilities', 'Shopping', 'Entertainment',
            'Healthcare', 'Investments', 'Loan Payments', 'Salary', 'Transfer', 'Uncategorized'].map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <input type="date" value={filters.startDate} onChange={e => handleFilterChange('startDate', e.target.value)} />
        <input type="date" value={filters.endDate} onChange={e => handleFilterChange('endDate', e.target.value)} />
      </div>

      {/* Count */}
      <div style={styles.count}>
        {total} transactions
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="loading">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div className="empty-state">
          <h3>No transactions found</h3>
          <p>Sync your Gmail to import financial transactions</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Merchant</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Account</th>
                <th style={styles.th}>Source</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => (
                <tr key={txn.id} style={styles.row}>
                  <td style={styles.td}>{formatDate(txn.date)}</td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 500 }}>{txn.merchant}</div>
                    {txn.merchantDetail && txn.merchantDetail !== txn.merchant && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{txn.merchantDetail}</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.categoryBadge, background: getCategoryColor(txn.category) + '20', color: getCategoryColor(txn.category) }}>
                      {txn.category}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {txn.accountLast4 && (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        ****{txn.accountLast4}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {txn.sources?.map((src, i) => (
                        <span key={i} className={`badge ${src === 'statement_pdf' ? 'badge-statement' : 'badge-alert'}`}>
                          {src === 'email_alert' ? '📧 Alert' : src === 'statement_pdf' ? '📄 PDF' : src}
                        </span>
                      ))}
                      {txn.verified && <span className="badge badge-verified">✓ Verified</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Trust: {txn.trustScore}%
                    </div>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, fontSize: 14,
                    color: txn.amount < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    {formatINR(txn.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div style={styles.pagination}>
          <button
            className="btn btn-secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            className="btn btn-secondary"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  filters: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  searchInput: {
    flex: '1 1 200px',
    minWidth: 200,
  },
  select: {
    minWidth: 160,
  },
  count: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  headerRow: {
    borderBottom: '1px solid var(--border-color)',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    borderBottom: '1px solid var(--border-color)',
    transition: 'background 0.1s',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
    verticalAlign: 'top',
  },
  categoryBadge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
  },
};
