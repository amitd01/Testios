const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const transactionController = require('../controllers/transactionController');
const accountController = require('../controllers/accountController');
const billController = require('../controllers/billController');
const investmentController = require('../controllers/investmentController');
const goalController = require('../controllers/goalController');
const budgetController = require('../controllers/budgetController');
const syncController = require('../controllers/syncController');
const insightsController = require('../controllers/insightsController');
const diagnosticsController = require('../controllers/diagnosticsController');
const senderController = require('../controllers/senderController');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

// Auth routes (no auth middleware)
router.get('/auth/google', authController.initiateOAuth);
router.get('/auth/google/callback', authController.handleCallback);
router.post('/api/revoke', authController.revokeAccess);

// Protected routes
router.use('/api', authMiddleware);

// User
router.get('/api/me', authController.getCurrentUser);

// Dashboard
router.get('/api/dashboard', dashboardController.getDashboard);

// Transactions
router.get('/api/transactions/export', transactionController.exportCsv);
router.get('/api/transactions/spending', transactionController.spending);
router.get('/api/transactions/categories', transactionController.categories);
router.get('/api/transactions/:id', transactionController.getById);
router.patch('/api/transactions/:id', transactionController.update);
router.get('/api/transactions', transactionController.list);

// Accounts
router.get('/api/accounts', accountController.list);
router.get('/api/accounts/net-worth', accountController.netWorth);
router.patch('/api/accounts/:id', accountController.update);
router.get('/api/accounts/:id/transactions', accountController.getTransactions);

// Bills
router.get('/api/bills', billController.list);
router.get('/api/bills/upcoming-count', billController.upcomingCount);
router.patch('/api/bills/:id/pay', billController.markPaid);

// Investments
router.get('/api/investments', investmentController.list);

// Goals
router.get('/api/goals', goalController.list);
router.post('/api/goals', goalController.create);
router.put('/api/goals/:id', goalController.update);
router.delete('/api/goals/:id', goalController.delete);

// Budgets
router.get('/api/budgets', budgetController.list);
router.post('/api/budgets', budgetController.upsert);
router.post('/api/budgets/template', budgetController.applyTemplate);
router.delete('/api/budgets/:id', budgetController.delete);

// Email Sync
router.post('/api/sync/start', syncController.startSync);
router.post('/api/sync/onboarding', syncController.onboardingScan);
router.post('/api/sync/reparse', syncController.reparse);
router.get('/api/sync/status', syncController.getStatus);

// Insights
router.get('/api/insights', insightsController.getInsights);

// Diagnostics
router.get('/api/diagnostics/sync-runs', diagnosticsController.listSyncRuns);
router.get('/api/diagnostics/sync-runs/:id', diagnosticsController.getSyncRun);
router.get('/api/diagnostics/sync-runs/:id/emails', diagnosticsController.getSyncRunEmails);
router.get('/api/diagnostics/sync-runs/:id/errors', diagnosticsController.getSyncRunErrors);
router.get('/api/diagnostics/email/:id', diagnosticsController.getEmailDetail);
router.get('/api/diagnostics/stats', diagnosticsController.getStats);
router.get('/api/diagnostics/senders', diagnosticsController.getSenderStats);
router.get('/api/diagnostics/parser-performance', diagnosticsController.getParserPerformance);
router.get('/api/diagnostics/llm-usage', diagnosticsController.getLLMUsage);

// Admin - Sender Management
router.get('/api/admin/senders', senderController.listSenders);
router.post('/api/admin/senders', senderController.addSender);
router.delete('/api/admin/senders/:domain', senderController.removeSender);
router.get('/api/admin/senders/pending', senderController.listPending);
router.post('/api/admin/senders/pending/:id/approve', senderController.approvePending);
router.get('/api/admin/templates', senderController.listTemplates);

// Settings - Document Passwords
router.get('/api/settings/document-passwords', settingsController.listDocumentPasswords);
router.post('/api/settings/document-passwords', settingsController.upsertDocumentPassword);
router.delete('/api/settings/document-passwords/:id', settingsController.deleteDocumentPassword);

module.exports = router;
