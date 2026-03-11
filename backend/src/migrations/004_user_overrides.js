const UP = `
-- User overrides on transactions: allow users to correct merchant, category, add notes
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_notes TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_merchant_override VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_category_override VARCHAR(50);

-- Account visibility: allow users to hide accounts they don't want to track
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;
`;

const DOWN = `
ALTER TABLE transactions DROP COLUMN IF EXISTS user_notes;
ALTER TABLE transactions DROP COLUMN IF EXISTS user_merchant_override;
ALTER TABLE transactions DROP COLUMN IF EXISTS user_category_override;
ALTER TABLE accounts DROP COLUMN IF EXISTS hidden;
`;

module.exports = { UP, DOWN };
