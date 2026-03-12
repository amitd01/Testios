const pool = require('../config/database');

class Candidate {
  static async findAll() {
    const { rows } = await pool.query('SELECT * FROM candidates ORDER BY created_at DESC');
    return rows;
  }

  static async findById(id) {
    const { rows } = await pool.query('SELECT * FROM candidates WHERE id = $1', [id]);
    return rows[0] || null;
  }

  static async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM candidates WHERE email = $1', [email]);
    return rows[0] || null;
  }

  static async create({ name, email, phone, source_consultant_id }) {
    const { rows } = await pool.query(
      'INSERT INTO candidates (name, email, phone, source_consultant_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, source_consultant_id]
    );
    return rows[0];
  }

  static async findOrCreate({ name, email, phone, source_consultant_id }) {
    if (email) {
      const existing = await this.findByEmail(email);
      if (existing) return existing;
    }
    return this.create({ name, email, phone, source_consultant_id });
  }
}

module.exports = Candidate;
