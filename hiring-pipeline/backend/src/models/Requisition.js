const pool = require('../config/database');

class Requisition {
  static async findAll({ status } = {}) {
    let query = `
      SELECT r.*, rf.name as role_family_name,
        (SELECT COUNT(*) FROM cv_submissions cs WHERE cs.requisition_id = r.id) as cv_count,
        (SELECT COUNT(*) FROM requisition_consultants rc WHERE rc.requisition_id = r.id) as consultant_count
      FROM requisitions r
      LEFT JOIN role_families rf ON r.role_family_id = rf.id
    `;
    const params = [];
    if (status) {
      params.push(status);
      query += ` WHERE r.status = $1`;
    }
    query += ' ORDER BY r.created_at DESC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async findById(id) {
    const { rows } = await pool.query(`
      SELECT r.*, rf.name as role_family_name
      FROM requisitions r
      LEFT JOIN role_families rf ON r.role_family_id = rf.id
      WHERE r.id = $1
    `, [id]);
    return rows[0] || null;
  }

  static async create({ title, role_family_id, hiring_manager_name, hiring_manager_email, description, field_expectations, compensation_range, team_info }) {
    const { rows } = await pool.query(
      `INSERT INTO requisitions (title, role_family_id, hiring_manager_name, hiring_manager_email, description, field_expectations, compensation_range, team_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, role_family_id, hiring_manager_name, hiring_manager_email, description, field_expectations, compensation_range, team_info]
    );
    return rows[0];
  }

  static async update(id, fields) {
    const allowed = ['title', 'role_family_id', 'hiring_manager_name', 'hiring_manager_email', 'description', 'field_expectations', 'compensation_range', 'team_info', 'status'];
    const sets = [];
    const params = [id];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (fields.status === 'filled') {
      sets.push('filled_at = NOW()');
    }

    if (sets.length === 0) return this.findById(id);

    const { rows } = await pool.query(
      `UPDATE requisitions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  static async getAssignedConsultants(requisitionId) {
    const { rows } = await pool.query(`
      SELECT rc.*, c.firm_name, c.contact_name, c.contact_email
      FROM requisition_consultants rc
      JOIN consultants c ON rc.consultant_id = c.id
      WHERE rc.requisition_id = $1
      ORDER BY rc.computed_rank
    `, [requisitionId]);
    return rows;
  }

  static async assignConsultant(requisitionId, consultantId, rank) {
    const { rows } = await pool.query(
      `INSERT INTO requisition_consultants (requisition_id, consultant_id, computed_rank)
       VALUES ($1, $2, $3)
       ON CONFLICT (requisition_id, consultant_id) DO UPDATE SET computed_rank = $3
       RETURNING *`,
      [requisitionId, consultantId, rank]
    );
    return rows[0];
  }
}

module.exports = Requisition;
