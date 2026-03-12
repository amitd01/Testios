import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import PipelineKanban from '../components/PipelineKanban';
import ConsultantRankBadge from '../components/ConsultantRankBadge';

function RequisitionDetail() {
  const { id } = useParams();
  const [req, setReq] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [cvForm, setCvForm] = useState({ candidate_name: '', candidate_email: '', consultant_id: '', consultant_rationale: '' });

  const load = useCallback(() => {
    api.get(`/requisitions/${id}`).then(r => setReq(r.data)).catch(() => {});
    api.get(`/cv-submissions?requisition_id=${id}`).then(r => setSubmissions(r.data)).catch(() => {});
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSuggest = async () => {
    const res = await api.get(`/requisitions/${id}/suggest-consultants`);
    setSuggestions(res.data);
  };

  const handleAssign = async () => {
    const ids = suggestions.map(s => s.consultant_id);
    await api.post(`/requisitions/${id}/assign-consultants`, { consultant_ids: ids });
    load();
    setSuggestions([]);
  };

  const handleSubmitCV = async (e) => {
    e.preventDefault();
    try {
      await api.post('/cv-submissions', { ...cvForm, requisition_id: parseInt(id) });
      setCvForm({ candidate_name: '', candidate_email: '', consultant_id: '', consultant_rationale: '' });
      setShowSubmitForm(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit CV');
    }
  };

  const handleAdvance = async (subId) => {
    try {
      await api.patch(`/cv-submissions/${subId}/advance`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to advance');
    }
  };

  const handleReject = async (subId) => {
    const reason = prompt('Rejection reason:');
    if (reason === null) return;
    try {
      await api.patch(`/cv-submissions/${subId}/reject`, { reason });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject');
    }
  };

  const handleCreateBriefing = async (subId) => {
    try {
      const res = await api.post('/briefings', { cv_submission_id: subId });
      const token = res.data.link_token;
      alert(`Briefing created! Share this link with the candidate:\n${window.location.origin}/briefing/${token}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create briefing');
    }
  };

  if (!req) return <p>Loading...</p>;

  return (
    <div>
      <div className="flex-between mb-4">
        <div>
          <h1>{req.title}</h1>
          <p style={{ color: '#636e72' }}>{req.role_family_name} | Manager: {req.hiring_manager_name || 'TBD'}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={handleSuggest}>Suggest Consultants</button>
          <button className="btn btn-primary" onClick={() => setShowSubmitForm(!showSubmitForm)}>Submit CV</button>
        </div>
      </div>

      {req.description && (
        <div className="card">
          <h3>Description</h3>
          <p className="mt-2">{req.description}</p>
          {req.field_expectations && <><h3 className="mt-4">Field Expectations</h3><p className="mt-2">{req.field_expectations}</p></>}
          {req.compensation_range && <p className="mt-2"><strong>Compensation:</strong> {req.compensation_range}</p>}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="card">
          <div className="flex-between">
            <h3>Suggested Consultants (by Yield)</h3>
            <button className="btn btn-success btn-sm" onClick={handleAssign}>Assign All</button>
          </div>
          <table className="mt-2">
            <thead><tr><th>Rank</th><th>Firm</th><th>Yield</th><th>Submissions</th></tr></thead>
            <tbody>
              {suggestions.map(s => (
                <tr key={s.consultant_id}>
                  <td><ConsultantRankBadge rank={s.rank} /></td>
                  <td>{s.firm_name}</td>
                  <td style={{ fontWeight: 600 }}>{s.overall_yield_pct}%</td>
                  <td>{s.total_submissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {req.assigned_consultants?.length > 0 && (
        <div className="card">
          <h3 className="mb-4">Assigned Consultants</h3>
          <div className="flex gap-4">
            {req.assigned_consultants.map(ac => (
              <div key={ac.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ConsultantRankBadge rank={ac.computed_rank} />
                <span>{ac.firm_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSubmitForm && (
        <div className="card">
          <h3 className="mb-4">Submit CV</h3>
          <form onSubmit={handleSubmitCV}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Candidate Name *</label>
                <input value={cvForm.candidate_name} onChange={e => setCvForm({ ...cvForm, candidate_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Candidate Email</label>
                <input type="email" value={cvForm.candidate_email} onChange={e => setCvForm({ ...cvForm, candidate_email: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Consultant</label>
              <select value={cvForm.consultant_id} onChange={e => setCvForm({ ...cvForm, consultant_id: e.target.value })}>
                <option value="">Direct / Internal</option>
                {(req.assigned_consultants || []).map(ac => (
                  <option key={ac.consultant_id} value={ac.consultant_id}>{ac.firm_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Consultant Rationale</label>
              <textarea value={cvForm.consultant_rationale} onChange={e => setCvForm({ ...cvForm, consultant_rationale: e.target.value })} placeholder="Why is this candidate a good fit?" />
            </div>
            <button type="submit" className="btn btn-success">Submit</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex-between mb-4">
          <h3>CV Pipeline ({submissions.length})</h3>
        </div>
        {submissions.length > 0 ? (
          <PipelineKanban submissions={submissions} onAdvance={handleAdvance} onReject={handleReject} />
        ) : (
          <p style={{ color: '#636e72' }}>No CVs submitted yet.</p>
        )}
      </div>

      {submissions.filter(s => s.status === 'shortlisted' && !s.briefing_status).length > 0 && (
        <div className="card">
          <h3 className="mb-4">Create Briefings</h3>
          <p style={{ fontSize: 13, color: '#636e72', marginBottom: 12 }}>
            Shortlisted candidates need a pre-interview briefing before advancing to manager review.
          </p>
          {submissions.filter(s => s.status === 'shortlisted' && !s.briefing_status).map(s => (
            <div key={s.id} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <span>{s.candidate_name}</span>
              <button className="btn btn-primary btn-sm" onClick={() => handleCreateBriefing(s.id)}>Create Briefing</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RequisitionDetail;
