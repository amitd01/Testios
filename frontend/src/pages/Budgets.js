import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card, ProgressBar } from '../components/Card';
import { formatINR, getCategoryColor } from '../utils/format';

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: '', monthlyLimit: '' });

  useEffect(() => { fetchBudgets(); }, []);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/budgets');
      setBudgets(data.budgets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newBudget.category || !newBudget.monthlyLimit) return;
    try {
      await api.post('/api/budgets', newBudget);
      setNewBudget({ category: '', monthlyLimit: '' });
      setShowForm(false);
      fetchBudgets();
    } catch (err) {
      console.error(err);
    }
  };

  const applyTemplate = async (template) => {
    const income = prompt('Enter your monthly income (e.g., 100000):');
    if (!income) return;
    try {
      await api.post('/api/budgets/template', { template, monthlyIncome: parseFloat(income) });
      fetchBudgets();
    } catch (err) {
      console.error(err);
    }
  };

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  if (loading) return <div className="loading">Loading budgets...</div>;

  return (
    <div>
      {/* Templates */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={() => applyTemplate('50/30/20')}>
          Apply 50/30/20 Rule
        </button>
        <button className="btn btn-secondary" onClick={() => applyTemplate('zero-based')}>
          Zero-Based Budget
        </button>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          + Add Budget
        </button>
      </div>

      {/* New Budget Form */}
      {showForm && (
        <Card className="" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={styles.label}>Category</label>
              <select value={newBudget.category} onChange={e => setNewBudget(p => ({ ...p, category: e.target.value }))}>
                <option value="">Select...</option>
                {['Food & Dining', 'Transportation', 'Bills & Utilities', 'Shopping', 'Entertainment',
                  'Healthcare', 'Rent', 'Personal Care', 'Education'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>Monthly Limit (₹)</label>
              <input type="number" value={newBudget.monthlyLimit} onChange={e => setNewBudget(p => ({ ...p, monthlyLimit: e.target.value }))} placeholder="10000" />
            </div>
            <button className="btn btn-primary" onClick={handleCreate}>Save</button>
          </div>
        </Card>
      )}

      {/* Summary */}
      {budgets.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Monthly Overview</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {formatINR(totalSpent)} / {formatINR(totalBudget)}
            </span>
          </div>
          <ProgressBar value={totalSpent} max={totalBudget} />
        </Card>
      )}

      {/* Budget Cards */}
      {budgets.length === 0 ? (
        <div className="empty-state">
          <h3>No budgets set</h3>
          <p>Create budgets to track your spending by category</p>
        </div>
      ) : (
        <div className="grid-2">
          {budgets.map(b => (
            <Card key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: getCategoryColor(b.category) }} />
                  <span style={{ fontWeight: 600 }}>{b.category}</span>
                </div>
                <span style={{ fontSize: 13, color: b.progress > 100 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                  {b.progress}%
                </span>
              </div>
              <ProgressBar value={b.spent} max={b.limit} color={getCategoryColor(b.category)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <span>Spent: {formatINR(b.spent)}</span>
                <span>Limit: {formatINR(b.limit)}</span>
              </div>
              {b.progress >= 80 && b.progress < 100 && (
                <div style={{ fontSize: 12, color: 'var(--accent-amber)', marginTop: 8 }}>
                  ⚠️ Approaching budget limit!
                </div>
              )}
              {b.progress >= 100 && (
                <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 8 }}>
                  🚨 Budget exceeded by {formatINR(b.spent - b.limit)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  label: { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 },
};
