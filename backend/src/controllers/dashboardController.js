const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Investment = require('../models/Investment');
const Bill = require('../models/Bill');
const Goal = require('../models/Goal');
const RawEmail = require('../models/RawEmail');

const dashboardController = {
  /**
   * GET /api/dashboard - Full dashboard data
   */
  async getDashboard(req, res) {
    try {
      const userId = req.userId;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

      const [
        netWorthData,
        cashFlow,
        lastMonthCashFlow,
        spending,
        goals,
        investments,
        upcomingBills,
        emailStats,
        recentTransactions,
      ] = await Promise.all([
        Account.getNetWorth(userId),
        Transaction.getCashFlow(userId, currentMonth),
        Transaction.getCashFlow(userId, lastMonthStr),
        Transaction.getMonthlySpending(userId, currentMonth),
        Goal.getByUser(userId),
        Investment.getPortfolioSummary(userId),
        Bill.getByUser(userId, { upcoming: true }),
        RawEmail.getStats(userId),
        Transaction.getByUser(userId, { limit: 5 }),
      ]);

      // Calculate net worth
      const bankBalance = parseFloat(netWorthData?.bank_balance) || 0;
      const ccOutstanding = Math.abs(parseFloat(netWorthData?.cc_outstanding) || 0);
      const investmentValue = investments.reduce((sum, inv) => sum + parseFloat(inv.total_value || 0), 0);
      const netWorth = bankBalance + investmentValue - ccOutstanding;

      // Cash flow
      const income = parseFloat(cashFlow?.income) || 0;
      const currentSpending = parseFloat(cashFlow?.spending) || 0;
      const lastIncome = parseFloat(lastMonthCashFlow?.income) || 0;
      const lastSpending = parseFloat(lastMonthCashFlow?.spending) || 0;

      // Spending breakdown (top categories)
      const spendingBreakdown = spending.slice(0, 6).map(s => ({
        category: s.category,
        amount: parseFloat(s.total),
      }));
      const totalSpending = spending.reduce((sum, s) => sum + parseFloat(s.total), 0);

      // Generate nudges
      const nudges = generateNudges({
        income, currentSpending, lastSpending,
        spending, upcomingBills, goals, ccOutstanding,
        ccLimit: parseFloat(netWorthData?.cc_limit) || 0,
      });

      res.json({
        netWorth: {
          total: netWorth,
          bankBalance,
          investments: investmentValue,
          liabilities: ccOutstanding,
        },
        cashFlow: {
          income,
          spending: currentSpending,
          savings: income - currentSpending,
          lastMonthIncome: lastIncome,
          lastMonthSpending: lastSpending,
        },
        spendingBreakdown: {
          categories: spendingBreakdown,
          total: totalSpending,
        },
        goals: goals.slice(0, 3).map(g => ({
          id: g.id,
          name: g.goal_name,
          type: g.goal_type,
          target: parseFloat(g.target_amount),
          current: parseFloat(g.current_amount),
          progress: g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0,
        })),
        investments: investments.map(inv => ({
          type: inv.investment_type,
          value: parseFloat(inv.total_value),
          invested: parseFloat(inv.total_invested),
          count: parseInt(inv.holdings_count),
        })),
        upcomingBills: upcomingBills.slice(0, 5).map(b => ({
          id: b.id,
          biller: b.biller_name,
          amount: parseFloat(b.amount),
          dueDate: b.due_date,
          type: b.bill_type,
        })),
        emailSync: {
          totalProcessed: parseInt(emailStats?.total) || 0,
          successful: parseInt(emailStats?.success) || 0,
          failed: parseInt(emailStats?.failed) || 0,
          pending: parseInt(emailStats?.pending) || 0,
          categories: emailStats?.categories || {},
          rawTransactions: emailStats?.rawTransactions || 0,
        },
        recentTransactions: recentTransactions.map(formatTransaction),
        nudges,
      });
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  },
};

function formatTransaction(t) {
  return {
    id: t.id,
    amount: parseFloat(t.amount),
    date: t.date,
    merchant: t.merchant,
    merchantDetail: t.merchant_detail,
    category: t.category,
    accountLast4: t.account_last4,
    type: t.transaction_type,
    sources: t.sources,
    verified: t.verified,
    trustScore: t.trust_score,
  };
}

function generateNudges({ income, currentSpending, lastSpending, spending, upcomingBills, goals, ccOutstanding, ccLimit }) {
  const nudges = [];

  // Spending comparison
  if (lastSpending > 0 && currentSpending > lastSpending * 0.8) {
    const pctUsed = Math.round((currentSpending / lastSpending) * 100);
    nudges.push({
      type: 'warning',
      title: 'Spending Alert',
      message: `You've spent ${pctUsed}% of last month's total already`,
      icon: '⚠️',
    });
  }

  // Upcoming bills
  const billsDueThisWeek = upcomingBills.filter(b => {
    const due = new Date(b.due_date);
    const diff = (due - new Date()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });
  if (billsDueThisWeek.length > 0) {
    const total = billsDueThisWeek.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);
    nudges.push({
      type: 'info',
      title: 'Bills Due',
      message: `${billsDueThisWeek.length} bills due this week totalling ₹${total.toLocaleString('en-IN')}`,
      icon: '📅',
    });
  }

  // Credit card utilization
  if (ccLimit > 0) {
    const utilization = (ccOutstanding / ccLimit) * 100;
    if (utilization > 30) {
      nudges.push({
        type: 'warning',
        title: 'Credit Utilization High',
        message: `Your credit utilization is ${Math.round(utilization)}%. Keep it under 30% for a healthy credit score`,
        icon: '💳',
      });
    }
  }

  // Savings rate
  if (income > 0) {
    const savingsRate = ((income - currentSpending) / income) * 100;
    if (savingsRate > 20) {
      nudges.push({
        type: 'success',
        title: 'Great Savings!',
        message: `You're saving ${Math.round(savingsRate)}% of your income this month`,
        icon: '🎉',
      });
    }
  }

  return nudges.slice(0, 4);
}

module.exports = dashboardController;
