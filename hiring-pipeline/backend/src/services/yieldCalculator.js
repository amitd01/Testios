const pool = require('../config/database');

class YieldCalculator {
  static async getRankingsForRoleFamily(roleFamilyId) {
    const { rows } = await pool.query(`
      SELECT
        ho.consultant_id,
        c.firm_name,
        c.contact_name,
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE ho.interviewed) as interviewed,
        COUNT(*) FILTER (WHERE ho.offered) as offered,
        COUNT(*) FILTER (WHERE ho.accepted) as accepted,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.interviewed)::numeric / COUNT(*) * 100, 1)
          ELSE 0 END as submit_to_interview_pct,
        CASE WHEN COUNT(*) FILTER (WHERE ho.interviewed) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.offered)::numeric / COUNT(*) FILTER (WHERE ho.interviewed) * 100, 1)
          ELSE 0 END as interview_to_offer_pct,
        CASE WHEN COUNT(*) FILTER (WHERE ho.offered) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.accepted)::numeric / COUNT(*) FILTER (WHERE ho.offered) * 100, 1)
          ELSE 0 END as offer_to_accept_pct,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.accepted)::numeric / COUNT(*) * 100, 1)
          ELSE 0 END as overall_yield_pct,
        ROUND(AVG(ho.time_to_fill_days) FILTER (WHERE ho.time_to_fill_days IS NOT NULL), 1) as avg_time_to_fill
      FROM hiring_outcomes ho
      JOIN consultants c ON ho.consultant_id = c.id
      WHERE ho.role_family_id = $1 AND c.active = true
      GROUP BY ho.consultant_id, c.firm_name, c.contact_name
      HAVING COUNT(*) >= 3
      ORDER BY overall_yield_pct DESC, avg_time_to_fill ASC NULLS LAST
    `, [roleFamilyId]);

    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  }

  static async getConsultantProfile(consultantId) {
    const { rows } = await pool.query(`
      SELECT
        ho.role_family_id,
        rf.name as role_family_name,
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE ho.accepted) as accepted,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.accepted)::numeric / COUNT(*) * 100, 1)
          ELSE 0 END as overall_yield_pct,
        ROUND(AVG(ho.time_to_fill_days) FILTER (WHERE ho.time_to_fill_days IS NOT NULL), 1) as avg_time_to_fill
      FROM hiring_outcomes ho
      JOIN role_families rf ON ho.role_family_id = rf.id
      WHERE ho.consultant_id = $1
      GROUP BY ho.role_family_id, rf.name
      ORDER BY overall_yield_pct DESC
    `, [consultantId]);

    return rows;
  }

  static async suggestConsultants(requisitionId) {
    const reqResult = await pool.query('SELECT role_family_id FROM requisitions WHERE id = $1', [requisitionId]);
    if (!reqResult.rows[0]) throw new Error('Requisition not found');

    const roleFamilyId = reqResult.rows[0].role_family_id;
    if (!roleFamilyId) return [];

    const rankings = await this.getRankingsForRoleFamily(roleFamilyId);
    return rankings.slice(0, 3);
  }

  static async recordOutcome({ requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days }) {
    const { rows } = await pool.query(
      `INSERT INTO hiring_outcomes (requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days]
    );
    return rows[0];
  }
}

module.exports = YieldCalculator;
