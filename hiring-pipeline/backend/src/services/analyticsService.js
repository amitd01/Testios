const pool = require('../config/database');

class AnalyticsService {
  /**
   * Monthly avg time-to-fill over last N months.
   */
  static async getTimeToHireTrend(months = 12) {
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', ho.created_at), 'YYYY-MM') as month,
        COUNT(*) as hires,
        ROUND(AVG(ho.time_to_fill_days), 1) as avg_days
      FROM hiring_outcomes ho
      WHERE ho.accepted = true
        AND ho.time_to_fill_days IS NOT NULL
        AND ho.created_at >= NOW() - INTERVAL '${parseInt(months)} months'
      GROUP BY DATE_TRUNC('month', ho.created_at)
      ORDER BY month
    `);
    return rows;
  }

  /**
   * Side-by-side consultant comparison.
   */
  static async getConsultantComparison(limit = 10) {
    const { rows } = await pool.query(`
      SELECT
        c.firm_name,
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
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.accepted)::numeric / COUNT(*) * 100, 1)
          ELSE 0 END as overall_yield_pct,
        ROUND(AVG(ho.time_to_fill_days) FILTER (WHERE ho.time_to_fill_days IS NOT NULL), 1) as avg_time_to_fill
      FROM hiring_outcomes ho
      JOIN consultants c ON ho.consultant_id = c.id
      WHERE c.active = true
      GROUP BY c.id, c.firm_name
      HAVING COUNT(*) >= 3
      ORDER BY overall_yield_pct DESC
      LIMIT $1
    `, [limit]);
    return rows;
  }

  /**
   * Conversion rates between pipeline stages.
   */
  static async getStageDropoff(requisitionId) {
    let whereClause = '';
    const params = [];
    if (requisitionId) {
      params.push(requisitionId);
      whereClause = `WHERE requisition_id = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total_submitted,
        COUNT(*) FILTER (WHERE screened_at IS NOT NULL) as screened,
        COUNT(*) FILTER (WHERE shortlisted_at IS NOT NULL) as shortlisted,
        COUNT(*) FILTER (WHERE sent_to_manager_at IS NOT NULL) as sent_to_manager,
        COUNT(*) FILTER (WHERE interview_scheduled_at IS NOT NULL) as interview_scheduled,
        COUNT(*) FILTER (WHERE status = 'hired') as hired
      FROM cv_submissions
      ${whereClause}
    `, params);

    const r = rows[0];
    const stages = [
      { stage: 'Submitted', count: parseInt(r.total_submitted) },
      { stage: 'Screened', count: parseInt(r.screened) },
      { stage: 'Shortlisted', count: parseInt(r.shortlisted) },
      { stage: 'Sent to Manager', count: parseInt(r.sent_to_manager) },
      { stage: 'Interviewed', count: parseInt(r.interview_scheduled) },
      { stage: 'Hired', count: parseInt(r.hired) },
    ];

    // Add conversion rates
    for (let i = 1; i < stages.length; i++) {
      stages[i].conversion_pct = stages[i - 1].count > 0
        ? Math.round(stages[i].count / stages[i - 1].count * 100)
        : 0;
    }
    stages[0].conversion_pct = 100;

    return stages;
  }

  /**
   * Briefing pass/fail stats and hire correlation.
   */
  static async getBriefingEffectiveness() {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE b.status = 'completed') as passed,
        COUNT(*) FILTER (WHERE b.status = 'failed') as failed,
        ROUND(
          COUNT(*) FILTER (WHERE b.status = 'completed')::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as pass_rate_pct,
        ROUND(AVG(jsonb_array_length(b.transcript)), 1) as avg_turns,
        COUNT(*) FILTER (WHERE b.status = 'completed' AND cv.status = 'hired') as hired_after_pass
      FROM briefings b
      LEFT JOIN cv_submissions cv ON b.cv_submission_id = cv.id
    `);

    const r = rows[0];
    return {
      total: parseInt(r.total),
      passed: parseInt(r.passed),
      failed: parseInt(r.failed),
      pass_rate_pct: parseFloat(r.pass_rate_pct) || 0,
      avg_conversation_turns: parseFloat(r.avg_turns) || 0,
      hired_after_pass: parseInt(r.hired_after_pass),
      hire_rate_after_pass: r.passed > 0
        ? Math.round(parseInt(r.hired_after_pass) / parseInt(r.passed) * 100)
        : 0,
    };
  }

  /**
   * Hires and metrics by role family.
   */
  static async getRoleFamilyBreakdown() {
    const { rows } = await pool.query(`
      SELECT
        rf.name as role_family,
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE ho.accepted) as hires,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ho.accepted)::numeric / COUNT(*) * 100, 1)
          ELSE 0 END as yield_pct,
        ROUND(AVG(ho.time_to_fill_days) FILTER (WHERE ho.time_to_fill_days IS NOT NULL), 1) as avg_time_to_fill
      FROM hiring_outcomes ho
      JOIN role_families rf ON ho.role_family_id = rf.id
      GROUP BY rf.id, rf.name
      ORDER BY hires DESC
    `);
    return rows;
  }
}

module.exports = AnalyticsService;
