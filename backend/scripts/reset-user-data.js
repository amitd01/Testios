#!/usr/bin/env node

/**
 * Reset Script: Clears all user data for a fresh trial
 *
 * Usage:
 *   node scripts/reset-user-data.js                    # Reset all users
 *   node scripts/reset-user-data.js --user email@x.com # Reset specific user
 *   node scripts/reset-user-data.js --full              # Also clear OAuth tokens (force re-auth)
 */

require('dotenv').config();
const db = require('../src/config/database');

async function resetUserData() {
  const args = process.argv.slice(2);
  const userEmail = args.find((a, i) => args[i - 1] === '--user');
  const fullReset = args.includes('--full');

  console.log('=== PFM Data Reset ===');
  console.log(`Mode: ${fullReset ? 'FULL (including OAuth tokens)' : 'Data only (preserving OAuth)'}`);
  console.log(`Target: ${userEmail || 'ALL users'}`);
  console.log('');

  try {
    // Get target user(s)
    let userCondition = '';
    let userParams = [];
    if (userEmail) {
      const user = await db.query('SELECT id, email FROM users WHERE email = $1', [userEmail]);
      if (user.rows.length === 0) {
        console.error(`User not found: ${userEmail}`);
        process.exit(1);
      }
      userCondition = 'WHERE user_id = $1';
      userParams = [user.rows[0].id];
      console.log(`Found user: ${user.rows[0].email} (${user.rows[0].id})`);
    }

    // Delete in dependency order (foreign keys)
    const tables = [
      'transactions',
      'raw_transactions',
      'bills',
      'investments',
      'accounts',
      'goals',
      'budgets',
      'sync_runs',
      'email_templates',
      'pending_senders',
      'document_passwords',
      'raw_emails',
    ];

    for (const table of tables) {
      try {
        const result = await db.query(
          `DELETE FROM ${table} ${userCondition}`,
          userParams
        );
        console.log(`  Cleared ${table}: ${result.rowCount} rows deleted`);
      } catch (err) {
        // Table may not exist yet
        console.log(`  Skipped ${table}: ${err.message.includes('does not exist') ? 'table not found' : err.message}`);
      }
    }

    // Reset user flags
    if (fullReset) {
      const updateQuery = userEmail
        ? `UPDATE users SET onboarded = false, gmail_last_sync = NULL, gmail_refresh_token = NULL, gmail_access_token = NULL, gmail_token_expiry = NULL WHERE email = $1`
        : `UPDATE users SET onboarded = false, gmail_last_sync = NULL, gmail_refresh_token = NULL, gmail_access_token = NULL, gmail_token_expiry = NULL`;
      const result = await db.query(updateQuery, userEmail ? [userEmail] : []);
      console.log(`\n  Reset user flags + OAuth tokens: ${result.rowCount} users`);
      console.log('  Note: Users will need to re-authenticate with Google');
    } else {
      const updateQuery = userEmail
        ? `UPDATE users SET onboarded = false, gmail_last_sync = NULL WHERE email = $1`
        : `UPDATE users SET onboarded = false, gmail_last_sync = NULL`;
      const result = await db.query(updateQuery, userEmail ? [userEmail] : []);
      console.log(`\n  Reset user flags: ${result.rowCount} users (OAuth tokens preserved)`);
    }

    console.log('\n=== Reset Complete ===');
    console.log('Preserved: users table (emails), sender_domains (whitelist), schema');
    console.log('Next: Start the app and re-authenticate / run onboarding scan');
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

resetUserData();
