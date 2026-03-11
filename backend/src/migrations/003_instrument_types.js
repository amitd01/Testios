const UP = `
-- Add instrument_type and financial_type to raw_transactions
ALTER TABLE raw_transactions ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(50);
ALTER TABLE raw_transactions ADD COLUMN IF NOT EXISTS financial_type VARCHAR(30);
ALTER TABLE raw_transactions ADD COLUMN IF NOT EXISTS date_source VARCHAR(20);
ALTER TABLE raw_transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);

-- Add instrument_type and financial_type to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS financial_type VARCHAR(30);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);

-- Add instrument_type to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(50);

-- Index for account ledger queries
CREATE INDEX IF NOT EXISTS idx_raw_txn_account ON raw_transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_instrument ON transactions(user_id, instrument_type, date DESC);

-- Document passwords for encrypted PDF handling
CREATE TABLE IF NOT EXISTS document_passwords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    institution_domain VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL,
    password_hint VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, institution_domain)
);
`;

const DOWN = `
ALTER TABLE raw_transactions DROP COLUMN IF EXISTS instrument_type;
ALTER TABLE raw_transactions DROP COLUMN IF EXISTS financial_type;
ALTER TABLE raw_transactions DROP COLUMN IF EXISTS date_source;
ALTER TABLE raw_transactions DROP COLUMN IF EXISTS account_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS instrument_type;
ALTER TABLE transactions DROP COLUMN IF EXISTS financial_type;
ALTER TABLE transactions DROP COLUMN IF EXISTS account_id;
ALTER TABLE accounts DROP COLUMN IF EXISTS instrument_type;
DROP TABLE IF EXISTS document_passwords CASCADE;
`;

module.exports = { UP, DOWN };
