import React, { useState } from 'react';
import api from '../utils/api';
import { formatINR, formatDate, getCategoryColor } from '../utils/format';

const ALL_CATEGORIES = [
  'Food & Dining', 'Transportation', 'Bills & Utilities', 'Shopping', 'Entertainment',
  'Healthcare', 'Investments', 'Loan Payments', 'Insurance', 'Education',
  'Transfer', 'Cash Withdrawal', 'Salary', 'Rent', 'Personal Care',
  'Gifts & Donations', 'Uncategorized',
];

export default function TransactionDetailModal({ transaction, onClose, onUpdate }) {
  const [editingMerchant, setEditingMerchant] = useState(false);
  const [merchantValue, setMerchantValue] = useState(transaction.merchant);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryValue, setCategoryValue] = useState(transaction.category);
  const [notes, setNotes] = useState(transaction.notes || '');
  const [saving, setSaving] = useState(false);
  const [notesChanged, setNotesChanged] = useState(false);

  const txn = transaction;
  const isDebit = txn.amount < 0;
  const needsReview = txn.trustScore < 70 || txn.category === 'Uncategorized';

  const handleSave = async (field, value) => {
    setSaving(true);
    try {
      const body = {};
      if (field === 'merchant') body.merchant = value;
      if (field === 'category') body.category = value;
      if (field === 'notes') body.notes = value;

      const result = await api.patch(`/api/transactions/${txn.id}`, body);
      if (onUpdate) onUpdate(result.transaction);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleMerchantSave = () => {
    if (merchantValue !== txn.merchant) {
      handleSave('merchant', merchantValue);
    }
    setEditingMerchant(false);
  };

  const handleCategoryChange = (newCategory) => {
    setCategoryValue(newCategory);
    handleSave('category', newCategory);
    setEditingCategory(false);
  };

  const handleNotesSave = () => {
    if (notesChanged) {
      handleSave('notes', notes);
      setNotesChanged(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(txn.date)}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: isDebit ? 'var(--accent-red)' : 'var(--accent-green)', marginTop: 4 }}>
              {formatINR(txn.amount)}
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {needsReview && (
          <div style={styles.reviewBanner}>
            Needs Review — Low confidence ({txn.trustScore}%) or uncategorized
          </div>
        )}

        {/* Merchant */}
        <div style={styles.section}>
          <div style={styles.label}>Merchant</div>
          {editingMerchant ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={merchantValue}
                onChange={e => setMerchantValue(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <button className="btn btn-primary" onClick={handleMerchantSave} disabled={saving} style={{ padding: '6px 16px' }}>
                Save
              </button>
              <button className="btn btn-secondary" onClick={() => { setEditingMerchant(false); setMerchantValue(txn.merchant); }} style={{ padding: '6px 16px' }}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{txn.merchant}</span>
              {txn.merchantOriginal && txn.merchantOriginal !== txn.merchant && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(original: {txn.merchantOriginal})</span>
              )}
              <button style={styles.editBtn} onClick={() => setEditingMerchant(true)} title="Edit merchant name">
                &#9998;
              </button>
            </div>
          )}
          {txn.merchantDetail && txn.merchantDetail !== txn.merchant && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{txn.merchantDetail}</div>
          )}
        </div>

        {/* Category */}
        <div style={styles.section}>
          <div style={styles.label}>Category</div>
          {editingCategory ? (
            <select
              value={categoryValue}
              onChange={e => handleCategoryChange(e.target.value)}
              style={styles.select}
              autoFocus
            >
              {ALL_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                ...styles.categoryBadge,
                background: getCategoryColor(txn.category) + '20',
                color: getCategoryColor(txn.category),
              }}>
                {txn.category}
              </span>
              {txn.categoryOriginal && txn.categoryOriginal !== txn.category && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(auto: {txn.categoryOriginal})</span>
              )}
              <button style={styles.editBtn} onClick={() => setEditingCategory(true)} title="Change category">
                &#9998;
              </button>
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div style={styles.detailsGrid}>
          <div style={styles.detailItem}>
            <div style={styles.detailLabel}>Account</div>
            <div style={styles.detailValue}>
              {txn.accountLast4 ? `****${txn.accountLast4}` : 'N/A'}
              {txn.accountType && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>{txn.accountType}</span>}
            </div>
          </div>
          <div style={styles.detailItem}>
            <div style={styles.detailLabel}>Type</div>
            <div style={styles.detailValue}>{txn.type || 'N/A'}</div>
          </div>
          {txn.instrumentType && (
            <div style={styles.detailItem}>
              <div style={styles.detailLabel}>Instrument</div>
              <div style={styles.detailValue}>{txn.instrumentType.replace(/_/g, ' ')}</div>
            </div>
          )}
          {txn.financialType && (
            <div style={styles.detailItem}>
              <div style={styles.detailLabel}>Financial Type</div>
              <div style={styles.detailValue}>{txn.financialType.replace(/_/g, ' ')}</div>
            </div>
          )}
        </div>

        {/* Sources & Trust */}
        <div style={styles.section}>
          <div style={styles.label}>Sources & Confidence</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {txn.sources?.map((src, i) => (
              <span key={i} className={`badge ${src === 'statement_pdf' ? 'badge-statement' : 'badge-alert'}`}>
                {src === 'email_alert' ? 'Email Alert' : src === 'statement_pdf' ? 'PDF Statement' : src}
              </span>
            ))}
            {txn.verified && <span className="badge badge-verified">Verified</span>}
            <span style={{ fontSize: 13, color: txn.trustScore >= 80 ? 'var(--accent-green)' : txn.trustScore >= 60 ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
              Trust: {txn.trustScore}%
            </span>
          </div>
        </div>

        {/* Notes */}
        <div style={styles.section}>
          <div style={styles.label}>Notes</div>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setNotesChanged(true); }}
            onBlur={handleNotesSave}
            placeholder="Add a note about this transaction..."
            style={styles.textarea}
            rows={3}
          />
          {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving...</span>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: 32,
    maxWidth: 560,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid var(--border-color)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  reviewBanner: {
    background: 'rgba(255, 183, 77, 0.15)',
    color: 'var(--accent-amber)',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  editBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-blue)',
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 6px',
  },
  input: {
    flex: 1,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 14,
  },
  select: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 14,
    minWidth: 200,
  },
  categoryBadge: {
    display: 'inline-block',
    padding: '3px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginBottom: 20,
    padding: 16,
    background: 'var(--bg-elevated)',
    borderRadius: 12,
  },
  detailItem: {},
  detailLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: 500,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
  },
};
