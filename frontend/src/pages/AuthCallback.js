import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '../utils/api';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const errorMsg = searchParams.get('message');

    if (token) {
      setToken(token);
      navigate('/onboarding');
    } else if (errorMsg) {
      setError(errorMsg);
    } else {
      setError('Authentication failed. No token received.');
    }
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={{ color: 'var(--accent-red)', marginBottom: 12 }}>Authentication Error</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={{ color: 'var(--text-secondary)' }}>Authenticating...</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: 40,
    textAlign: 'center',
  },
};
