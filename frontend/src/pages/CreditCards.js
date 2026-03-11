import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Card, ProgressBar } from '../components/Card';
import { formatINR, formatDate } from '../utils/format';
import api from '../utils/api';

export default function CreditCards() {
  const { data, loading, refetch } = useApi('/api/accounts?includeHidden=true');
  const [toggling, setToggling] = useState(null);

  if (loading) return <div className="loading">Loading accounts...</div>;

  const accounts = data?.accounts || [];
  const creditCards = accounts.filter(a => a.type === 'credit_card');
  const bankAccounts = accounts.filter(a => a.type !== 'credit_card');

  const toggleHidden = async (accountId, currentHidden) => {
    setToggling(accountId);
    try {
      await api.patch(`/api/accounts/${accountId}`, { hidden: !currentHidden });
      refetch();
    } catch (err) {
      console.error('Failed to toggle account visibility:', err);
    } finally {
      setToggling(null);
    }
  };

  const renderHideToggle = (account) => (
    <button
      style={{
        ...styles.hideBtn,
        opacity: toggling === account.id ? 0.5 : 1,
        color: account.hidden ? 'var(--accent-amber)' : 'var(--text-muted)',
      }}
      onClick={() => toggleHidden(account.id, account.hidden)}
      disabled={toggling === account.id}
      title={account.hidden ? 'Show this account' : 'Hide this account'}
    >
      {account.hidden ? 'Hidden' : 'Visible'}
    </button>
  );

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Accounts & Credit Cards</h2>

      {/* Credit Cards */}
      {creditCards.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>Credit Cards</h3>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {creditCards.map(card => (
              <Card key={card.id} style={card.hidden ? { opacity: 0.5 } : {}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{card.institution}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>****{card.last4}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {renderHideToggle(card)}
                    <div style={styles.cardChip}>&#128179;</div>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Outstanding</span>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{formatINR(Math.abs(card.balance))}</span>
                  </div>
                  {card.creditLimit && (
                    <>
                      <ProgressBar
                        value={Math.abs(card.balance)}
                        max={card.creditLimit}
                        color={card.utilization > 70 ? 'var(--accent-red)' : card.utilization > 30 ? 'var(--accent-amber)' : 'var(--accent-green)'}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Limit: {formatINR(card.creditLimit)}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: card.utilization > 30 ? 'var(--accent-red)' : 'var(--accent-green)'
                        }}>
                          {card.utilization}% utilization
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {card.utilization > 30 && !card.hidden && (
                  <div style={{ padding: 8, background: 'rgba(247,111,111,0.1)', borderRadius: 8, fontSize: 12, color: 'var(--accent-red)' }}>
                    High utilization. Try to keep below 30% for good credit score.
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Bank Accounts */}
      {bankAccounts.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>Bank Accounts</h3>
          <div className="grid-2">
            {bankAccounts.map(acc => (
              <Card key={acc.id} style={acc.hidden ? { opacity: 0.5 } : {}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{acc.institution}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {acc.type.replace('_', ' ')} ****{acc.last4}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {renderHideToggle(acc)}
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatINR(acc.balance)}</div>
                    {acc.lastStatementDate && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Statement: {formatDate(acc.lastStatementDate)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {accounts.length === 0 && (
        <div className="empty-state">
          <h3>No accounts detected</h3>
          <p>Accounts will be automatically detected from your bank and credit card emails</p>
        </div>
      )}
    </div>
  );
}

const styles = {
  cardChip: { fontSize: 32 },
  hideBtn: {
    background: 'none',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 500,
  },
};
