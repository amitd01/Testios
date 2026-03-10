const Investment = require('../models/Investment');

const investmentController = {
  async list(req, res) {
    try {
      const investments = await Investment.getByUser(req.userId);
      const summary = await Investment.getPortfolioSummary(req.userId);
      res.json({
        investments: investments.map(inv => ({
          id: inv.id,
          institution: inv.institution_name,
          type: inv.investment_type,
          schemeName: inv.scheme_name,
          units: parseFloat(inv.units) || 0,
          nav: parseFloat(inv.nav) || 0,
          currentValue: parseFloat(inv.current_value) || 0,
          investedValue: parseFloat(inv.invested_value) || 0,
          gain: (parseFloat(inv.current_value) || 0) - (parseFloat(inv.invested_value) || 0),
          statementDate: inv.statement_date,
        })),
        summary: {
          totalValue: summary.reduce((s, r) => s + parseFloat(r.total_value || 0), 0),
          totalInvested: summary.reduce((s, r) => s + parseFloat(r.total_invested || 0), 0),
          byType: summary.map(s => ({
            type: s.investment_type,
            value: parseFloat(s.total_value),
            invested: parseFloat(s.total_invested),
            count: parseInt(s.holdings_count),
          })),
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch investments' });
    }
  },
};

module.exports = investmentController;
