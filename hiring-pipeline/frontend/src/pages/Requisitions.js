import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

function Requisitions() {
  const [requisitions, setRequisitions] = useState([]);
  const [roleFamilies, setRoleFamilies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', role_family_id: '', hiring_manager_name: '', hiring_manager_email: '',
    description: '', field_expectations: '', compensation_range: '', team_info: '',
  });

  useEffect(() => {
    api.get('/requisitions').then(r => setRequisitions(r.data)).catch(() => {});
    api.get('/role-families').then(r => setRoleFamilies(r.data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/requisitions', form);
      setRequisitions([res.data, ...requisitions]);
      setForm({ title: '', role_family_id: '', hiring_manager_name: '', hiring_manager_email: '', description: '', field_expectations: '', compensation_range: '', team_info: '' });
      setShowForm(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create requisition');
    }
  };

  return (
    <div>
      <div className="flex-between mb-4">
        <h1>Requisitions</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Requisition'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="mb-4">Create Requisition</h3>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Role Family</label>
                <select value={form.role_family_id} onChange={e => setForm({ ...form, role_family_id: e.target.value })}>
                  <option value="">Select...</option>
                  {roleFamilies.map(rf => <option key={rf.id} value={rf.id}>{rf.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Compensation Range</label>
                <input value={form.compensation_range} onChange={e => setForm({ ...form, compensation_range: e.target.value })} placeholder="e.g. 15-20 LPA" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Hiring Manager</label>
                <input value={form.hiring_manager_name} onChange={e => setForm({ ...form, hiring_manager_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Manager Email</label>
                <input type="email" value={form.hiring_manager_email} onChange={e => setForm({ ...form, hiring_manager_email: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Field/Work Expectations</label>
              <textarea value={form.field_expectations} onChange={e => setForm({ ...form, field_expectations: e.target.value })} placeholder="Describe any field work, travel, or on-site requirements..." />
            </div>
            <div className="form-group">
              <label>Team Info</label>
              <textarea value={form.team_info} onChange={e => setForm({ ...form, team_info: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-success">Create Requisition</button>
          </form>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Title</th><th>Role Family</th><th>Manager</th><th>CVs</th><th>Consultants</th><th>Status</th></tr>
          </thead>
          <tbody>
            {requisitions.map(r => (
              <tr key={r.id}>
                <td><Link to={`/requisitions/${r.id}`}><strong>{r.title}</strong></Link></td>
                <td>{r.role_family_name || '-'}</td>
                <td>{r.hiring_manager_name || '-'}</td>
                <td>{r.cv_count || 0}</td>
                <td>{r.consultant_count || 0}</td>
                <td><span className={`badge badge-${r.status === 'open' ? 'shortlisted' : r.status === 'filled' ? 'hired' : 'rejected'}`}>{r.status}</span></td>
              </tr>
            ))}
            {requisitions.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#636e72' }}>No requisitions yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Requisitions;
