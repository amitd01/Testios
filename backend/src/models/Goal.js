const db = require('../config/database');

const Goal = {
  async create(goal) {
    const result = await db.query(
      `INSERT INTO goals (user_id, goal_name, goal_type, target_amount, current_amount, deadline)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [goal.user_id, goal.goal_name, goal.goal_type, goal.target_amount,
       goal.current_amount || 0, goal.deadline]
    );
    return result.rows[0];
  },

  async getByUser(userId) {
    const result = await db.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY deadline ASC', [userId]
    );
    return result.rows;
  },

  async update(goalId, updates) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      if (['goal_name', 'goal_type', 'target_amount', 'current_amount', 'deadline'].includes(key)) {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) return null;
    fields.push('updated_at = NOW()');
    values.push(goalId);
    const result = await db.query(
      `UPDATE goals SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    return result.rows[0];
  },

  async delete(goalId) {
    await db.query('DELETE FROM goals WHERE id = $1', [goalId]);
  },
};

module.exports = Goal;
