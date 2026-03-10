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

const router = express.Router();

// Auth routes (no auth middleware)
router.get('/auth/google', authController.initiateOAuth);
router.get('/auth/google/callback', authController.handleCallback);

// Protected routes
router.use('/api', authMiddleware);

// User
router.get('/api/me', authController.getCurrentUser);
router.post('/api/revoke', authController.revokeAccess);

// Dashboard
router.get('/api/dashboard', dashboardController.getDashboard);

// Transactions
router.get('/api/transactions', transactionController.list);
router.get('/api/transactions/spending', transactionController.spending);
router.get('/api/transactions/categories', transactionController.categories);

// Accounts
router.get('/api/accounts', accountController.list);
router.get('/api/accounts/net-worth', accountController.netWorth);

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
router.get('/api/sync/status', syncController.getStatus);

// Insights
router.get('/api/insights', insightsController.getInsights);

module.exports = router;
