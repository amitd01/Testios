const Transaction = require('../models/Transaction');
const Bill = require('../models/Bill');
const Account = require('../models/Account');
const RawEmail = require('../models/RawEmail');

const insightsController = {
  async getInsights(req, res) {
    try {
      const userId = req.userId;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

      const [
        currentSpending,
        lastSpending,
        accounts,
        bills,
        emailStats,
        recentTxns,
      ] = await Promise.all([
        Transaction.getMonthlySpending(userId, currentMonth),
        Transaction.getMonthlySpending(userId, lastMonthStr),
        Account.getByUser(userId),
        Bill.getByUser(userId),
        RawEmail.getStats(userId),
        Transaction.getByUser(userId, { limit: 100 }),
      ]);

      const insights = [];

      // Spending comparison by category
      const lastSpendingMap = {};
      for (const s of lastSpending) lastSpendingMap[s.category] = parseFloat(s.total);

      for (const s of currentSpending) {
        const current = parseFloat(s.total);
        const previous = lastSpendingMap[s.category] || 0;
        if (previous > 0 && current > previous * 1.2) {
          const pct = Math.round(((current - previous) / previous) * 100);
          insights.push({
            type: 'spending_increase',
            severity: 'warning',
            title: `${s.category} spending up ${pct}%`,
            message: `You've spent ₹${current.toLocaleString('en-IN')} on ${s.category} this month vs ₹${previous.toLocaleString('en-IN')} last month`,
            icon: '📈',
          });
        }
      }

      // Credit card utilization
      for (const account of accounts) {
        if (account.account_type === 'credit_card' && account.credit_limit) {
          const utilization = (Math.abs(account.balance || 0) / account.credit_limit) * 100;
          if (utilization > 30) {
            insights.push({
              type: 'cc_utilization',
              severity: utilization > 70 ? 'error' : 'warning',
              title: `${account.institution_name} utilization ${Math.round(utilization)}%`,
              message: `Your ${account.institution_name} card ending ${account.account_number_last4} has ${Math.round(utilization)}% utilization. Keep below 30% for good credit score.`,
              icon: '💳',
            });
          }
        }
      }

      // Bill payment patterns
      const paidBills = bills.filter(b => b.paid);
      const latePaidBills = paidBills.filter(b => b.paid_at && b.due_date && new Date(b.paid_at) > new Date(b.due_date));
      if (latePaidBills.length > 0) {
        insights.push({
          type: 'late_payments',
          severity: 'warning',
          title: `${latePaidBills.length} late payment(s) detected`,
          message: `You had ${latePaidBills.length} late bill payments. Set up auto-pay to avoid late fees.`,
          icon: '⏰',
        });
      }

      // On-time payments streak
      const onTimeBills = paidBills.filter(b => b.paid_at && b.due_date && new Date(b.paid_at) <= new Date(b.due_date));
      if (onTimeBills.length >= 3) {
        insights.push({
          type: 'payment_streak',
          severity: 'success',
          title: `${onTimeBills.length} bills paid on time!`,
          message: `Great job! You've paid ${onTimeBills.length} bills before their due dates.`,
          icon: '🎉',
        });
      }

      // Data quality insight
      const total = parseInt(emailStats?.total) || 0;
      const success = parseInt(emailStats?.success) || 0;
      if (total > 0) {
        const parseRate = Math.round((success / total) * 100);
        const verifiedTxns = recentTxns.filter(t => t.verified).length;
        const verifiedRate = recentTxns.length > 0 ? Math.round((verifiedTxns / recentTxns.length) * 100) : 0;
        insights.push({
          type: 'data_quality',
          severity: 'info',
          title: `Data Quality: ${parseRate}% emails parsed`,
          message: `${verifiedRate}% of transactions verified across email alerts and PDF statements`,
          icon: '📊',
        });
      }

      // Recurring subscription detection
      const subscriptionTxns = recentTxns.filter(t =>
        t.category === 'Entertainment' && t.transaction_type === 'debit'
      );
      const subscriptionMerchants = [...new Set(subscriptionTxns.map(t => t.merchant))];
      if (subscriptionMerchants.length > 0) {
        const totalSub = subscriptionTxns.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
        insights.push({
          type: 'subscriptions',
          severity: 'info',
          title: `${subscriptionMerchants.length} active subscriptions`,
          message: `You're spending ₹${totalSub.toLocaleString('en-IN')} on subscriptions: ${subscriptionMerchants.join(', ')}`,
          icon: '📺',
        });
      }

      res.json({ insights });
    } catch (err) {
      console.error('Insights error:', err);
      res.status(500).json({ error: 'Failed to generate insights' });
    }
  },
};

module.exports = insightsController;
