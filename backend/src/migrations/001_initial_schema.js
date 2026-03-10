const UP = `
-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    gmail_refresh_token TEXT,
    gmail_access_token TEXT,
    gmail_token_expiry TIMESTAMPTZ,
    gmail_last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    onboarded BOOLEAN DEFAULT FALSE
);

-- Email Senders (Whitelist)
CREATE TABLE IF NOT EXISTS email_senders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    institution_name VARCHAR(100),
    institution_type VARCHAR(50),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, domain)
);

-- Raw Emails (Audit trail)
CREATE TABLE IF NOT EXISTS raw_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    gmail_message_id VARCHAR(255) UNIQUE NOT NULL,
    sender VARCHAR(255) NOT NULL,
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    attachments JSONB DEFAULT '[]',
    received_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    email_category VARCHAR(50),
    parsing_status VARCHAR(50) DEFAULT 'pending',
    parsing_errors TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_raw_emails_user_received ON raw_emails(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_emails_gmail_id ON raw_emails(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_raw_emails_status ON raw_emails(user_id, parsing_status);

-- Raw Transactions (Pre-deduplication)
CREATE TABLE IF NOT EXISTS raw_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email_id UUID REFERENCES raw_emails(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    date DATE NOT NULL,
    merchant TEXT,
    account_last4 VARCHAR(4),
    account_type VARCHAR(50),
    transaction_type VARCHAR(20),
    payment_method VARCHAR(50),
    balance_after DECIMAL(15,2),
    category VARCHAR(50),
    source VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_raw_txn_user_date ON raw_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_raw_txn_dedup ON raw_transactions(user_id, amount, date, account_last4);

-- Transactions (Deduplicated & Harmonized)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    date DATE NOT NULL,
    merchant TEXT NOT NULL,
    merchant_detail TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'Uncategorized',
    account_last4 VARCHAR(4),
    account_type VARCHAR(50),
    transaction_type VARCHAR(20) NOT NULL,
    sources TEXT[] DEFAULT '{}',
    verified BOOLEAN DEFAULT FALSE,
    trust_score INT DEFAULT 80,
    raw_transaction_ids UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(user_id, category, date DESC);

-- Accounts (Detected from emails)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    institution_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    account_number_last4 VARCHAR(4) NOT NULL,
    balance DECIMAL(15,2),
    credit_limit DECIMAL(15,2),
    last_statement_date DATE,
    last_statement_email_id UUID REFERENCES raw_emails(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, institution_name, account_number_last4)
);

-- Bills (From reminder emails)
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    biller_name VARCHAR(100) NOT NULL,
    bill_type VARCHAR(50),
    account_number VARCHAR(100),
    amount DECIMAL(15,2),
    due_date DATE,
    paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    payment_transaction_id UUID REFERENCES transactions(id),
    reminder_email_id UUID REFERENCES raw_emails(id),
    recurrence VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_user_due ON bills(user_id, due_date);

-- Investments (From MF CAS / Demat statements)
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    institution_name VARCHAR(100),
    investment_type VARCHAR(50),
    scheme_name TEXT,
    units DECIMAL(15,4),
    nav DECIMAL(15,4),
    current_value DECIMAL(15,2),
    invested_value DECIMAL(15,2),
    statement_date DATE,
    statement_email_id UUID REFERENCES raw_emails(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    goal_name VARCHAR(100) NOT NULL,
    goal_type VARCHAR(50),
    target_amount DECIMAL(15,2) NOT NULL,
    current_amount DECIMAL(15,2) DEFAULT 0,
    deadline DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budgets
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    monthly_limit DECIMAL(15,2) NOT NULL,
    current_spent DECIMAL(15,2) DEFAULT 0,
    month DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, category, month)
);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    sync_frequency VARCHAR(20) DEFAULT 'hourly',
    dark_mode BOOLEAN DEFAULT TRUE,
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const DOWN = `
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS investments CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS raw_transactions CASCADE;
DROP TABLE IF EXISTS raw_emails CASCADE;
DROP TABLE IF EXISTS email_senders CASCADE;
DROP TABLE IF EXISTS users CASCADE;
`;

module.exports = { UP, DOWN };
