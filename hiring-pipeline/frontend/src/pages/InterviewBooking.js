import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const publicApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3002/api',
});

function InterviewBooking() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    publicApi.get(`/interviews/schedule/${token}`)
      .then(res => setData(res.data))
      .catch(() => setError('Scheduling link not found or expired. Please check your link.'));
  }, [token]);

  const handleBook = async () => {
    if (!selectedSlot) return;
    setBooking(true);
    try {
      const res = await publicApi.post(`/interviews/schedule/${token}/book`, { slot_id: selectedSlot });
      setConfirmed(res.data.booking);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to book. The slot may no longer be available.');
    }
    setBooking(false);
  };

  if (error) {
    return (
      <div className="chat-container" style={{ textAlign: 'center', marginTop: 100 }}>
        <h2>Scheduling Unavailable</h2>
        <p style={{ color: '#636e72', marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  if (!data) return <div className="chat-container"><p>Loading scheduling options...</p></div>;

  // Already booked
  if (data.status === 'booked' || confirmed) {
    const b = confirmed || data.booking;
    return (
      <div className="chat-container">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2>Interview Confirmed</h2>
          <p style={{ color: '#636e72' }}>Role: <strong>{b.requisition_title}</strong></p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#x2705;</div>
          <h3>You're all set!</h3>
          <p className="mt-2" style={{ color: '#636e72' }}>Your interview has been scheduled.</p>
          <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, margin: '16px 0', textAlign: 'left' }}>
            <p><strong>Date:</strong> {new Date(b.start_time).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Time:</strong> {new Date(b.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} &ndash; {new Date(b.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
            <p><strong>Interviewer:</strong> {b.interviewer_name}</p>
          </div>
          <p style={{ fontSize: 13, color: '#636e72' }}>You'll receive a calendar invite with meeting details shortly.</p>
        </div>
      </div>
    );
  }

  // Group slots by date
  const slotsByDate = {};
  for (const slot of data.available_slots || []) {
    const dateKey = new Date(slot.start_time).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = [];
    slotsByDate[dateKey].push(slot);
  }

  return (
    <div className="chat-container">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h2>Schedule Your Interview</h2>
        <p style={{ color: '#636e72' }}>Role: <strong>{data.requisition_title}</strong></p>
        <p style={{ fontSize: 13, color: '#636e72' }}>Hi {data.candidate_name}, please select a time slot that works for you.</p>
      </div>

      {Object.keys(slotsByDate).length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ color: '#636e72' }}>No interview slots are available at the moment. Please check back later.</p>
        </div>
      ) : (
        <>
          {Object.entries(slotsByDate).map(([date, slots]) => (
            <div key={date} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginBottom: 12 }}>{date}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {slots.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot.id)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: selectedSlot === slot.id ? '2px solid #0984e3' : '2px solid #dfe6e9',
                      background: selectedSlot === slot.id ? '#e3f2fd' : '#fff',
                      cursor: 'pointer',
                      fontSize: 14,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {new Date(slot.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {' \u2013 '}
                      {new Date(slot.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 12, color: '#636e72', marginTop: 2 }}>{slot.interviewer_name}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {selectedSlot && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                className="btn btn-success"
                onClick={handleBook}
                disabled={booking}
                style={{ padding: '12px 32px', fontSize: 16 }}
              >
                {booking ? 'Booking...' : 'Confirm Interview'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default InterviewBooking;
