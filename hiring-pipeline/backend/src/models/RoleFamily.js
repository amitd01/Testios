const pool = require('../config/database');

class RoleFamily {
  static async findAll() {
    const { rows } = await pool.query('SELECT * FROM role_families ORDER BY name');
    return rows;
  }

  static async findById(id) {
    const { rows } = await pool.query('SELECT * FROM role_families WHERE id = $1', [id]);
    return rows[0] || null;
  }

  static async create({ name, description }) {
    const { rows } = await pool.query(
      'INSERT INTO role_families (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    return rows[0];
  }

  static async update(id, { name, description }) {
    const { rows } = await pool.query(
      'UPDATE role_families SET name = COALESCE($2, name), description = COALESCE($3, description) WHERE id = $1 RETURNING *',
      [id, name, description]
    );
    return rows[0] || null;
  }
}

module.exports = RoleFamily;
