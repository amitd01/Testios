import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const publicApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3002/api',
});

function BriefingChat() {
  const { token } = useParams();
  const [briefing, setBriefing] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const messagesEnd = useRef(null);

  useEffect(() => {
    publicApi.get(`/briefings/by-token/${token}`)
      .then(res => {
        setBriefing(res.data);
        setMessages(res.data.transcript || []);
        if (res.data.status === 'completed' || res.data.status === 'failed') {
          setCompleted(true);
        }
      })
      .catch(() => setError('Briefing not found. Please check your link.'));
  }, [token]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    setMessages(prev => [...prev, { role: 'user', content: msg }]);

    try {
      const res = await publicApi.post(`/briefings/${token}/chat`, { message: msg });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    }

    setSending(false);
  };

  const handleComplete = async () => {
    setSending(true);
    try {
      const res = await publicApi.post(`/briefings/${token}/complete`);
      setResult(res.data);
      setCompleted(true);
    } catch (err) {
      alert('Failed to complete briefing. Please try again.');
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (error) {
    return (
      <div className="chat-container" style={{ textAlign: 'center', marginTop: 100 }}>
        <h2>Briefing Unavailable</h2>
        <p style={{ color: '#636e72', marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  if (!briefing) return <div className="chat-container"><p>Loading briefing...</p></div>;

  return (
    <div className="chat-container">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h2>Pre-Interview Briefing</h2>
        <p style={{ color: '#636e72' }}>Role: <strong>{briefing.requisition_title}</strong></p>
        <p style={{ fontSize: 13, color: '#636e72' }}>Hi {briefing.candidate_name}, this conversation will help you understand the role before your interview.</p>
      </div>

      {completed && result && (
        <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
          <h3>{result.passed ? 'Briefing Complete' : 'Briefing Review Needed'}</h3>
          <p style={{ color: '#636e72', marginTop: 4 }}>{result.summary}</p>
          {result.passed && <p className="mt-2" style={{ color: '#00b894', fontWeight: 600 }}>You're all set for the interview stage.</p>}
        </div>
      )}

      {completed && !result && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>This briefing has been completed.</h3>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !completed && (
          <p style={{ color: '#636e72', textAlign: 'center' }}>
            Start by saying hello or asking about the role!
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.role}`}>
            <div className="bubble">{m.content}</div>
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      {!completed && (
        <>
          <div className="chat-input">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              disabled={sending}
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? '...' : 'Send'}
            </button>
          </div>
          {messages.length >= 4 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="btn btn-success" onClick={handleComplete} disabled={sending}>
                I'm Ready - Complete Briefing
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default BriefingChat;
