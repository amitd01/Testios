import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card, ProgressBar } from '../components/Card';
import { formatINR, formatINRShort, formatDate } from '../utils/format';

const GOAL_TYPES = [
  { value: 'emergency_fund', label: 'Emergency Fund', icon: '🛡' },
  { value: 'vacation', label: 'Vacation', icon: '✈️' },
  { value: 'wedding', label: 'Wedding', icon: '💍' },
  { value: 'down_payment', label: 'Down Payment', icon: '🏠' },
  { value: 'education', label: 'Education', icon: '🎓' },
  { value: 'retirement', label: 'Retirement', icon: '🌅' },
  { value: 'debt_payoff', label: 'Debt Payoff', icon: '💸' },
  { value: 'custom', label: 'Custom', icon: '⭐' },
];

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ goalName: '', goalType: 'custom', targetAmount: '', currentAmount: '', deadline: '' });

  useEffect(() => { fetchGoals(); }, []);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/goals');
      setGoals(data.goals);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.goalName || !form.targetAmount) return;
    try {
      await api.post('/api/goals', form);
      setForm({ goalName: '', goalType: 'custom', targetAmount: '', currentAmount: '', deadline: '' });
      setShowForm(false);
      fetchGoals();
    } catch (err) { console.error(err); }
  };

  const handleUpdate = async (id, currentAmount) => {
    const newAmount = prompt('Enter current saved amount:', currentAmount);
    if (newAmount === null) return;
    try {
      await api.put(`/api/goals/${id}`, { currentAmount: parseFloat(newAmount) });
      fetchGoals();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return;
    try {
      await api.delete(`/api/goals/${id}`);
      fetchGoals();
    } catch (err) { console.error(err); }
  };

  const getGoalIcon = (type) => GOAL_TYPES.find(t => t.value === type)?.icon || '⭐';

  if (loading) return <div className="loading">Loading goals...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Financial Goals</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ New Goal</button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={styles.label}>Goal Name</label>
              <input type="text" value={form.goalName} onChange={e => setForm(p => ({ ...p, goalName: e.target.value }))} placeholder="e.g., Goa Trip" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={styles.label}>Type</label>
              <select value={form.goalType} onChange={e => setForm(p => ({ ...p, goalType: e.target.value }))} style={{ width: '100%' }}>
                {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Target Amount (₹)</label>
              <input type="number" value={form.targetAmount} onChange={e => setForm(p => ({ ...p, targetAmount: e.target.value }))} placeholder="500000" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={styles.label}>Saved So Far (₹)</label>
              <input type="number" value={form.currentAmount} onChange={e => setForm(p => ({ ...p, currentAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={styles.label}>Deadline</label>
              <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleCreate} style={{ width: '100%' }}>Create Goal</button>
            </div>
          </div>
        </Card>
      )}

      {goals.length === 0 ? (
        <div className="empty-state">
          <h3>No goals yet</h3>
          <p>Set financial goals to track your savings progress</p>
        </div>
      ) : (
        <div className="grid-2">
          {goals.map(goal => (
            <Card key={goal.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={styles.goalIcon}>{getGoalIcon(goal.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{goal.name}</div>
                  {goal.deadline && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Deadline: {formatDate(goal.deadline)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: goal.progress >= 100 ? 'var(--accent-green)' : 'var(--accent-blue)' }}>
                  {goal.progress}%
                </div>
              </div>

              <ProgressBar value={goal.currentAmount} max={goal.targetAmount} color={goal.progress >= 100 ? 'var(--accent-green)' : 'var(--accent-blue)'} height={10} />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saved</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{formatINRShort(goal.currentAmount)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Target</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{formatINRShort(goal.targetAmount)}</div>
                </div>
              </div>

              {goal.progress >= 100 && (
                <div style={{ textAlign: 'center', marginTop: 12, padding: 8, background: 'rgba(45,216,130,0.1)', borderRadius: 8, color: 'var(--accent-green)', fontWeight: 600 }}>
                  🎉 Goal Achieved!
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, padding: '6px 12px' }} onClick={() => handleUpdate(goal.id, goal.currentAmount)}>
                  Update Progress
                </button>
                <button className="btn btn-danger" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => handleDelete(goal.id)}>
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  label: { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 },
  goalIcon: { width: 48, height: 48, borderRadius: 14, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 },
};
