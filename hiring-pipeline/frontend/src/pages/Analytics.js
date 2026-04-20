import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../utils/api';

const COLORS = ['#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7', '#00cec9', '#d63031', '#636e72'];

function Analytics() {
  const [timeToHire, setTimeToHire] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [dropoff, setDropoff] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [roleFamily, setRoleFamily] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/time-to-hire').catch(() => ({ data: [] })),
      api.get('/analytics/consultant-comparison').catch(() => ({ data: [] })),
      api.get('/analytics/stage-dropoff').catch(() => ({ data: [] })),
      api.get('/analytics/briefing-effectiveness').catch(() => ({ data: null })),
      api.get('/analytics/role-family-breakdown').catch(() => ({ data: [] })),
    ]).then(([tth, cc, sd, be, rf]) => {
      setTimeToHire(tth.data);
      setConsultants(cc.data);
      setDropoff(sd.data);
      setBriefing(be.data);
      setRoleFamily(rf.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading analytics...</p>;

  const briefingPieData = briefing ? [
    { name: 'Passed', value: briefing.passed },
    { name: 'Failed', value: briefing.failed },
  ] : [];

  return (
    <div>
      <h1 className="mb-4">Analytics</h1>

      {/* Time to Hire Trend */}
      <div className="card">
        <h3 className="mb-4">Time-to-Hire Trend (Monthly Avg)</h3>
        {timeToHire.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeToHire}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
              <Tooltip formatter={(val) => [`${val} days`, 'Avg TTF']} />
              <Line type="monotone" dataKey="avg_days" stroke="#0984e3" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: '#636e72' }}>No hire data with time-to-fill available yet.</p>
        )}
      </div>

      {/* Consultant Comparison */}
      <div className="card">
        <h3 className="mb-4">Consultant Comparison — Yield Metrics</h3>
        {consultants.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={consultants} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="firm_name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val) => `${val}%`} />
              <Legend />
              <Bar dataKey="submit_to_interview_pct" name="Submit→Interview" fill="#74b9ff" />
              <Bar dataKey="interview_to_offer_pct" name="Interview→Offer" fill="#00b894" />
              <Bar dataKey="overall_yield_pct" name="Overall Yield" fill="#0984e3" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: '#636e72' }}>Need 3+ submissions per consultant to show comparison.</p>
        )}
      </div>

      {/* Stage Drop-off */}
      <div className="card">
        <h3 className="mb-4">Pipeline Drop-off Analysis</h3>
        {dropoff.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dropoff}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0984e3" radius={[4, 4, 0, 0]}>
                  {dropoff.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {dropoff.map((s, i) => i > 0 && (
                <div key={s.stage} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12,
                  background: s.conversion_pct >= 50 ? '#e8f5e9' : '#fce4ec',
                  color: s.conversion_pct >= 50 ? '#2e7d32' : '#c62828',
                }}>
                  {dropoff[i - 1].stage} → {s.stage}: <strong>{s.conversion_pct}%</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p style={{ color: '#636e72' }}>No pipeline data available.</p>
        )}
      </div>

      {/* Briefing Effectiveness */}
      <div className="card">
        <h3 className="mb-4">Briefing Effectiveness</h3>
        {briefing && briefing.total > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={briefingPieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} label>
                  <Cell fill="#00b894" />
                  <Cell fill="#d63031" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div style={{ textAlign: 'center', padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{briefing.total}</div>
                <div style={{ fontSize: 11, color: '#636e72' }}>Total Briefings</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#00b894' }}>{briefing.pass_rate_pct}%</div>
                <div style={{ fontSize: 11, color: '#636e72' }}>Pass Rate</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{briefing.avg_conversation_turns}</div>
                <div style={{ fontSize: 11, color: '#636e72' }}>Avg Turns</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#0984e3' }}>{briefing.hire_rate_after_pass}%</div>
                <div style={{ fontSize: 11, color: '#636e72' }}>Hire After Pass</div>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: '#636e72' }}>No briefing data available.</p>
        )}
      </div>

      {/* Role Family Breakdown */}
      <div className="card">
        <h3 className="mb-4">Role Family Breakdown</h3>
        {roleFamily.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={roleFamily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="role_family" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_submissions" name="Submissions" fill="#b2bec3" />
                <Bar dataKey="hires" name="Hires" fill="#00b894" />
              </BarChart>
            </ResponsiveContainer>
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Role Family</th><th>Submissions</th><th>Hires</th><th>Yield %</th><th>Avg TTF</th></tr>
              </thead>
              <tbody>
                {roleFamily.map(rf => (
                  <tr key={rf.role_family}>
                    <td><strong>{rf.role_family}</strong></td>
                    <td>{rf.total_submissions}</td>
                    <td>{rf.hires}</td>
                    <td>{rf.yield_pct}%</td>
                    <td>{rf.avg_time_to_fill ? `${rf.avg_time_to_fill}d` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p style={{ color: '#636e72' }}>No role family data available.</p>
        )}
      </div>
    </div>
  );
}

export default Analytics;
