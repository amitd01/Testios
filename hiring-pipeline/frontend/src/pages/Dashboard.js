import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';

function Dashboard() {
  const [pipeline, setPipeline] = useState([]);
  const [aging, setAging] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [allCvs, setAllCvs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/cv-submissions/dashboard').catch(() => ({ data: [] })),
      api.get('/cv-submissions/aging?days=3').catch(() => ({ data: [] })),
      api.get('/requisitions?status=open').catch(() => ({ data: [] })),
      api.get('/cv-submissions').catch(() => ({ data: [] })),
    ]).then(([pRes, aRes, rRes, cvRes]) => {
      setPipeline(pRes.data);
      setAging(aRes.data);
      setRequisitions(rRes.data);
      setAllCvs(cvRes.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading...</p>;

  const totalActive = pipeline.filter(p => !['hired', 'rejected'].includes(p.status))
    .reduce((sum, p) => sum + parseInt(p.count), 0);

  const scoredCvs = allCvs.filter(cv => cv.fit_score != null);
  const avgFitScore = scoredCvs.length > 0
    ? Math.round(scoredCvs.reduce((sum, cv) => sum + cv.fit_score, 0) / scoredCvs.length)
    : null;

  return (
    <div>
      <h1 className="mb-4">Pipeline Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <h3>Active CVs</h3>
          <p style={{ fontSize: 32, fontWeight: 700 }}>{totalActive}</p>
        </div>
        <div className="card">
          <h3>Avg Fit Score</h3>
          <p style={{ fontSize: 32, fontWeight: 700, color: avgFitScore >= 70 ? '#00b894' : avgFitScore >= 40 ? '#f39c12' : '#d63031' }}>
            {avgFitScore != null ? `${avgFitScore}/100` : 'N/A'}
          </p>
          <p style={{ fontSize: 12, color: '#636e72' }}>{scoredCvs.length} CVs scored</p>
        </div>
        <div className="card">
          <h3>Aging Alerts</h3>
          <p style={{ fontSize: 32, fontWeight: 700, color: aging.length > 0 ? '#d63031' : '#00b894' }}>
            {aging.length}
          </p>
          <p style={{ fontSize: 12, color: '#636e72' }}>CVs stalled 3+ days</p>
        </div>
        <div className="card">
          <h3>Open Requisitions</h3>
          <p style={{ fontSize: 32, fontWeight: 700 }}>{requisitions.length}</p>
        </div>
      </div>

      {pipeline.length > 0 && (
        <div className="card">
          <h3 className="mb-4">Pipeline Funnel</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pipeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0984e3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {aging.length > 0 && (
        <div className="card">
          <h3 className="mb-4">Stalled CVs (3+ Days)</h3>
          <table>
            <thead>
              <tr><th>Candidate</th><th>Consultant</th><th>Status</th><th>Days</th></tr>
            </thead>
            <tbody>
              {aging.map(a => (
                <tr key={a.id}>
                  <td>{a.candidate_name}</td>
                  <td>{a.consultant_firm || '-'}</td>
                  <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                  <td style={{ fontWeight: 600, color: '#d63031' }}>{parseFloat(a.days_in_stage).toFixed(1)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {requisitions.length > 0 && (
        <div className="card">
          <h3 className="mb-4">Open Requisitions</h3>
          <table>
            <thead>
              <tr><th>Title</th><th>Role Family</th><th>CVs</th><th>Consultants</th></tr>
            </thead>
            <tbody>
              {requisitions.map(r => (
                <tr key={r.id}>
                  <td><Link to={`/requisitions/${r.id}`}>{r.title}</Link></td>
                  <td>{r.role_family_name || '-'}</td>
                  <td>{r.cv_count}</td>
                  <td>{r.consultant_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
