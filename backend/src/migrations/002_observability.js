const UP = `
-- Sync Runs: tracks each sync operation end-to-end
CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    run_type VARCHAR(20) NOT NULL DEFAULT 'full',
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Counters
    emails_found INTEGER DEFAULT 0,
    emails_processed INTEGER DEFAULT 0,
    emails_parsed INTEGER DEFAULT 0,
    emails_failed INTEGER DEFAULT 0,
    emails_skipped INTEGER DEFAULT 0,
    transactions_extracted INTEGER DEFAULT 0,
    transactions_deduplicated INTEGER DEFAULT 0,
    attachments_processed INTEGER DEFAULT 0,

    -- Performance breakdown
    gmail_api_calls INTEGER DEFAULT 0,
    gmail_api_time_ms INTEGER DEFAULT 0,
    parse_time_ms INTEGER DEFAULT 0,
    db_time_ms INTEGER DEFAULT 0,

    -- LLM usage
    llm_calls INTEGER DEFAULT 0,
    llm_tokens_total INTEGER DEFAULT 0,
    llm_cost_usd DECIMAL(8,4) DEFAULT 0,

    -- Error summary
    error_summary JSONB DEFAULT '{}',

    -- Config snapshot
    search_query TEXT,
    since_date TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_user ON sync_runs(user_id, started_at DESC);

-- New columns on raw_emails for per-email observability
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS sync_run_id UUID REFERENCES sync_runs(id);
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER;
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS error_type VARCHAR(50);
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS parser_used VARCHAR(50);
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS transactions_extracted INTEGER DEFAULT 0;
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5,2);
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS processing_details JSONB DEFAULT '{}';
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS llm_used BOOLEAN DEFAULT FALSE;
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS llm_tokens_used INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_raw_emails_sync_run ON raw_emails(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_raw_emails_error_type ON raw_emails(error_type) WHERE error_type IS NOT NULL;

-- Sender Domains: DB-driven whitelist replacing hardcoded JS object
CREATE TABLE IF NOT EXISTS sender_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) UNIQUE NOT NULL,
    institution_name VARCHAR(100) NOT NULL,
    institution_type VARCHAR(20) NOT NULL,
    subdomains_allowed BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    email_template_hint VARCHAR(50),
    added_by VARCHAR(20) DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sender_domains_active ON sender_domains(is_active) WHERE is_active = TRUE;

-- Pending Senders: auto-detected unknown financial senders
CREATE TABLE IF NOT EXISTS pending_senders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) NOT NULL,
    sample_sender VARCHAR(255),
    sample_subject TEXT,
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    auto_classification JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(domain)
);

-- Email Templates: per-institution template tracking
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_domain VARCHAR(255) NOT NULL,
    template_type VARCHAR(30) NOT NULL,
    template_fingerprint VARCHAR(255),
    parsing_hints JSONB DEFAULT '{}',
    sample_email_id UUID REFERENCES raw_emails(id),
    success_rate DECIMAL(5,2) DEFAULT 0,
    total_parsed INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(institution_domain, template_type, template_fingerprint)
);

-- Seed sender_domains from the hardcoded whitelist
INSERT INTO sender_domains (domain, institution_name, institution_type) VALUES
    -- Banks
    ('hdfcbank.net', 'HDFC Bank', 'bank'),
    ('hdfcbank.com', 'HDFC Bank', 'bank'),
    ('icicibank.com', 'ICICI Bank', 'bank'),
    ('sbi.co.in', 'SBI', 'bank'),
    ('axisbank.com', 'Axis Bank', 'bank'),
    ('kotak.com', 'Kotak Mahindra Bank', 'bank'),
    ('kotakbank.com', 'Kotak Mahindra Bank', 'bank'),
    ('yesbank.in', 'Yes Bank', 'bank'),
    ('indusind.com', 'IndusInd Bank', 'bank'),
    ('federalbank.co.in', 'Federal Bank', 'bank'),
    ('idbibank.co.in', 'IDBI Bank', 'bank'),
    ('bankofbaroda.co.in', 'Bank of Baroda', 'bank'),
    ('pnb.co.in', 'PNB', 'bank'),
    ('canarabank.com', 'Canara Bank', 'bank'),
    ('unionbankofindia.co.in', 'Union Bank', 'bank'),
    -- Credit Cards
    ('cards.hdfcbank.com', 'HDFC Card', 'credit_card'),
    ('icicibankcard.com', 'ICICI Card', 'credit_card'),
    ('sbicard.com', 'SBI Card', 'credit_card'),
    ('axiscard.com', 'Axis Card', 'credit_card'),
    -- UPI / Payment Apps
    ('phonepe.com', 'PhonePe', 'upi'),
    ('paytm.com', 'Paytm', 'upi'),
    ('google.com', 'Google Pay', 'upi'),
    ('amazonpay.in', 'Amazon Pay', 'upi'),
    -- Investment
    ('camsonline.com', 'CAMS', 'investment'),
    ('kfintech.com', 'KFintech', 'investment'),
    ('cdslindia.com', 'CDSL', 'investment'),
    ('nsdl.co.in', 'NSDL', 'investment'),
    ('zerodha.com', 'Zerodha', 'investment'),
    ('groww.in', 'Groww', 'investment'),
    -- Billers
    ('bescom.co.in', 'BESCOM', 'biller'),
    ('bescom.org', 'BESCOM', 'biller'),
    ('mahadiscom.in', 'MSEDCL', 'biller'),
    ('tatapower.com', 'Tata Power', 'biller'),
    ('airtel.in', 'Airtel', 'biller'),
    ('airtel.com', 'Airtel', 'biller'),
    ('jio.com', 'Jio', 'biller'),
    ('vodafone.in', 'Vodafone', 'biller'),
    ('bsnl.co.in', 'BSNL', 'biller'),
    ('licindia.in', 'LIC', 'biller'),
    ('hdfclife.com', 'HDFC Life', 'biller'),
    ('iciciprulife.com', 'ICICI Prudential', 'biller'),
    ('netflix.com', 'Netflix', 'biller'),
    ('amazon.in', 'Amazon', 'biller'),
    ('spotify.com', 'Spotify', 'biller')
ON CONFLICT (domain) DO NOTHING;
`;

const DOWN = `
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS pending_senders CASCADE;
DROP TABLE IF EXISTS sender_domains CASCADE;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS sync_run_id;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS processing_time_ms;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS error_type;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS parser_used;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS transactions_extracted;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS confidence_score;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS processing_details;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS llm_used;
ALTER TABLE raw_emails DROP COLUMN IF EXISTS llm_tokens_used;
DROP TABLE IF EXISTS sync_runs CASCADE;
`;

module.exports = { UP, DOWN };
