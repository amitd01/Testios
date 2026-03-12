const pool = require('../config/database');

class Consultant {
  static async findAll({ active, roleFamilyId } = {}) {
    let query = `
      SELECT c.*,
        COALESCE(json_agg(json_build_object('id', rf.id, 'name', rf.name))
          FILTER (WHERE rf.id IS NOT NULL), '[]') AS specialties
      FROM consultants c
      LEFT JOIN consultant_specialties cs ON c.id = cs.consultant_id
      LEFT JOIN role_families rf ON cs.role_family_id = rf.id
    `;
    const conditions = [];
    const params = [];

    if (active !== undefined) {
      params.push(active);
      conditions.push(`c.active = $${params.length}`);
    }
    if (roleFamilyId) {
      params.push(roleFamilyId);
      conditions.push(`EXISTS (SELECT 1 FROM consultant_specialties cs2 WHERE cs2.consultant_id = c.id AND cs2.role_family_id = $${params.length})`);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY c.id ORDER BY c.firm_name';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async findById(id) {
    const { rows } = await pool.query(`
      SELECT c.*,
        COALESCE(json_agg(json_build_object('id', rf.id, 'name', rf.name))
          FILTER (WHERE rf.id IS NOT NULL), '[]') AS specialties
      FROM consultants c
      LEFT JOIN consultant_specialties cs ON c.id = cs.consultant_id
      LEFT JOIN role_families rf ON cs.role_family_id = rf.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);
    return rows[0] || null;
  }

  static async create({ firm_name, contact_name, contact_email, phone, notes, specialty_ids = [] }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO consultants (firm_name, contact_name, contact_email, phone, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [firm_name, contact_name, contact_email, phone, notes]
      );
      const consultant = rows[0];

      for (const rfId of specialty_ids) {
        await client.query(
          'INSERT INTO consultant_specialties (consultant_id, role_family_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [consultant.id, rfId]
        );
      }

      await client.query('COMMIT');
      return this.findById(consultant.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async update(id, { firm_name, contact_name, contact_email, phone, notes, active, specialty_ids }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE consultants SET
          firm_name = COALESCE($2, firm_name),
          contact_name = COALESCE($3, contact_name),
          contact_email = COALESCE($4, contact_email),
          phone = COALESCE($5, phone),
          notes = COALESCE($6, notes),
          active = COALESCE($7, active)
        WHERE id = $1`,
        [id, firm_name, contact_name, contact_email, phone, notes, active]
      );

      if (specialty_ids !== undefined) {
        await client.query('DELETE FROM consultant_specialties WHERE consultant_id = $1', [id]);
        for (const rfId of specialty_ids) {
          await client.query(
            'INSERT INTO consultant_specialties (consultant_id, role_family_id) VALUES ($1, $2)',
            [id, rfId]
          );
        }
      }

      await client.query('COMMIT');
      return this.findById(id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = Consultant;
