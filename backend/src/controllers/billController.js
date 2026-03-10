const Bill = require('../models/Bill');

const billController = {
  async list(req, res) {
    try {
      const { upcoming } = req.query;
      const bills = await Bill.getByUser(req.userId, { upcoming: upcoming === 'true' });
      res.json({
        bills: bills.map(b => ({
          id: b.id,
          biller: b.biller_name,
          type: b.bill_type,
          accountNumber: b.account_number,
          amount: parseFloat(b.amount) || null,
          dueDate: b.due_date,
          paid: b.paid,
          paidAt: b.paid_at,
          recurrence: b.recurrence,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch bills' });
    }
  },

  async markPaid(req, res) {
    try {
      const { id } = req.params;
      const { transactionId } = req.body;
      const bill = await Bill.markPaid(id, transactionId || null);
      if (!bill) return res.status(404).json({ error: 'Bill not found' });
      res.json({ bill });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update bill' });
    }
  },

  async upcomingCount(req, res) {
    try {
      const count = await Bill.getUpcomingCount(req.userId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch bill count' });
    }
  },
};

module.exports = billController;
