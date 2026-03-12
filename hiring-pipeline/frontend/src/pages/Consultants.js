import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConsultantRankBadge from '../components/ConsultantRankBadge';

function Consultants() {
  const [consultants, setConsultants] = useState([]);
  const [roleFamilies, setRoleFamilies] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [rankings, setRankings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firm_name: '', contact_name: '', contact_email: '', phone: '', specialty_ids: [] });

  useEffect(() => {
    api.get('/consultants').then(r => setConsultants(r.data)).catch(() => {});
    api.get('/role-families').then(r => setRoleFamilies(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedRole) {
      api.get(`/consultants/rankings-by-role/${selectedRole}`).then(r => setRankings(r.data)).catch(() => setRankings([]));
    } else {
      setRankings([]);
    }
  }, [selectedRole]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/consultants', form);
      setConsultants([...consultants, res.data]);
      setForm({ firm_name: '', contact_name: '', contact_email: '', phone: '', specialty_ids: [] });
      setShowForm(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create consultant');
    }
  };

  return (
    <div>
      <div className="flex-between mb-4">
        <h1>Consultants</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Consultant'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="mb-4">New Consultant</h3>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Firm Name *</label>
              <input value={form.firm_name} onChange={e => setForm({ ...form, firm_name: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Contact Name</label>
                <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Contact Email</label>
                <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Specialties</label>
              <select multiple value={form.specialty_ids} onChange={e => setForm({ ...form, specialty_ids: Array.from(e.target.selectedOptions, o => o.value) })} style={{ height: 120 }}>
                {roleFamilies.map(rf => <option key={rf.id} value={rf.id}>{rf.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-success">Create</button>
          </form>
        </div>
      )}

      <div className="card mb-4">
        <h3 className="mb-4">Rankings by Role Family</h3>
        <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
          <option value="">Select a role family...</option>
          {roleFamilies.map(rf => <option key={rf.id} value={rf.id}>{rf.name}</option>)}
        </select>

        {rankings.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>Firm</th><th>Submissions</th>
                <th>Submit-to-Interview</th><th>Interview-to-Offer</th>
                <th>Overall Yield</th><th>Avg Days</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map(r => (
                <tr key={r.consultant_id}>
                  <td><ConsultantRankBadge rank={r.rank} /></td>
                  <td><strong>{r.firm_name}</strong><br /><span style={{ fontSize: 12, color: '#636e72' }}>{r.contact_name}</span></td>
                  <td>{r.total_submissions}</td>
                  <td>{r.submit_to_interview_pct}%</td>
                  <td>{r.interview_to_offer_pct}%</td>
                  <td style={{ fontWeight: 600 }}>{r.overall_yield_pct}%</td>
                  <td>{r.avg_time_to_fill || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {selectedRole && rankings.length === 0 && <p style={{ color: '#636e72', marginTop: 8 }}>No ranking data yet (need 3+ submissions per consultant).</p>}
      </div>

      <div className="card">
        <h3 className="mb-4">All Consultants ({consultants.length})</h3>
        <table>
          <thead>
            <tr><th>Firm</th><th>Contact</th><th>Email</th><th>Specialties</th><th>Status</th></tr>
          </thead>
          <tbody>
            {consultants.map(c => (
              <tr key={c.id}>
                <td><strong>{c.firm_name}</strong></td>
                <td>{c.contact_name || '-'}</td>
                <td>{c.contact_email || '-'}</td>
                <td>{(c.specialties || []).map(s => s.name).join(', ') || '-'}</td>
                <td><span className={`badge ${c.active ? 'badge-completed' : 'badge-rejected'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Consultants;
