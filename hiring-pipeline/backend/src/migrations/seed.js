require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../config/database');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Consultants ──
    const consultants = [
      { firm: 'Apex Talent Partners', contact: 'Sarah Chen', email: 'sarah@apextalent.com', phone: '+1-415-555-0101' },
      { firm: 'BlueWave Recruiting', contact: 'James Park', email: 'james@bluewaverecruiting.com', phone: '+1-212-555-0202' },
      { firm: 'TechBridge Search', contact: 'Priya Sharma', email: 'priya@techbridge.io', phone: '+44-20-7946-0303' },
      { firm: 'Sterling Executive Group', contact: 'Marcus Johnson', email: 'marcus@sterlingexec.com', phone: '+1-312-555-0404' },
      { firm: 'Nova Staffing Solutions', contact: 'Emily Rodriguez', email: 'emily@novastaffing.com', phone: '+1-650-555-0505' },
      { firm: 'Summit Recruitment', contact: 'David Kim', email: 'david@summitrecruit.co', phone: '+65-6123-0606' },
    ];

    const consultantIds = [];
    for (const c of consultants) {
      const { rows } = await client.query(
        `INSERT INTO consultants (firm_name, contact_name, contact_email, phone, active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [c.firm, c.contact, c.email, c.phone]
      );
      if (rows.length) consultantIds.push(rows[0].id);
    }
    console.log(`Inserted ${consultantIds.length} consultants`);

    // ── Get role families (seeded by migration) ──
    const { rows: roleFamilies } = await client.query('SELECT id, name FROM role_families ORDER BY id');
    const rfMap = {};
    for (const rf of roleFamilies) rfMap[rf.name] = rf.id;

    // ── Consultant specialties ──
    const specialtyMap = [
      [0, ['Engineering', 'Product']],
      [1, ['Sales', 'Marketing']],
      [2, ['Engineering', 'Leadership']],
      [3, ['Leadership', 'Finance', 'Operations']],
      [4, ['HR', 'Operations', 'Marketing']],
      [5, ['Engineering', 'Product', 'Sales']],
    ];
    for (const [idx, families] of specialtyMap) {
      if (!consultantIds[idx]) continue;
      for (const fam of families) {
        if (!rfMap[fam]) continue;
        await client.query(
          `INSERT INTO consultant_specialties (consultant_id, role_family_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [consultantIds[idx], rfMap[fam]]
        );
      }
    }

    // ── Requisitions ──
    const requisitions = [
      { title: 'Senior Backend Engineer', rf: 'Engineering', manager: 'Alex Thompson', email: 'alex.t@company.com', desc: 'Build scalable microservices for our payment platform. Experience with Go or Rust preferred.', comp: '$180k-$220k + equity', status: 'open' },
      { title: 'VP of Sales, APAC', rf: 'Sales', manager: 'Lisa Wang', email: 'lisa.w@company.com', desc: 'Lead our expansion into Southeast Asian markets. Must have enterprise SaaS sales leadership experience.', comp: '$250k-$300k OTE', status: 'open' },
      { title: 'Product Manager - AI/ML', rf: 'Product', manager: 'Raj Patel', email: 'raj.p@company.com', desc: 'Own the AI features roadmap. Strong technical background and ability to work with ML engineers.', comp: '$170k-$200k + equity', status: 'open' },
      { title: 'Chief Financial Officer', rf: 'Finance', manager: 'Board of Directors', email: 'board@company.com', desc: 'Series C company seeking experienced CFO for IPO preparation.', comp: '$350k-$450k + equity', status: 'open' },
      { title: 'Head of People Operations', rf: 'HR', manager: 'CEO Office', email: 'ceo@company.com', desc: 'Scale our people team from 200 to 500 employees over the next 18 months.', comp: '$200k-$250k', status: 'open' },
      { title: 'DevOps Lead', rf: 'Engineering', manager: 'Alex Thompson', email: 'alex.t@company.com', desc: 'Kubernetes, Terraform, CI/CD pipelines. Lead a team of 4 SREs.', comp: '$190k-$230k', status: 'open' },
      { title: 'Marketing Director', rf: 'Marketing', manager: 'Lisa Wang', email: 'lisa.w@company.com', desc: 'Brand strategy and demand generation for B2B SaaS.', comp: '$160k-$200k', status: 'filled' },
    ];

    const reqIds = [];
    for (const r of requisitions) {
      const { rows } = await client.query(
        `INSERT INTO requisitions (title, role_family_id, hiring_manager_name, hiring_manager_email, description, compensation_range, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [r.title, rfMap[r.rf], r.manager, r.email, r.desc, r.comp, r.status]
      );
      reqIds.push(rows[0].id);
    }
    console.log(`Inserted ${reqIds.length} requisitions`);

    // ── Assign consultants to requisitions ──
    const assignments = [
      [0, [0, 2, 5], [1, 2, 3]],       // Senior Backend Eng -> Apex, TechBridge, Summit
      [1, [1, 5], [1, 2]],              // VP Sales APAC -> BlueWave, Summit
      [2, [0, 5], [1, 2]],              // PM AI/ML -> Apex, Summit
      [3, [3], [1]],                     // CFO -> Sterling
      [4, [4], [1]],                     // Head of People -> Nova
      [5, [0, 2], [1, 2]],              // DevOps -> Apex, TechBridge
    ];
    for (const [reqIdx, consultantIdxs, ranks] of assignments) {
      for (let i = 0; i < consultantIdxs.length; i++) {
        if (!consultantIds[consultantIdxs[i]]) continue;
        await client.query(
          `INSERT INTO requisition_consultants (requisition_id, consultant_id, computed_rank) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [reqIds[reqIdx], consultantIds[consultantIdxs[i]], ranks[i]]
        );
      }
    }

    // ── Candidates ──
    const candidates = [
      { name: 'Michael Torres', email: 'michael.torres@gmail.com', phone: '+1-555-1001', consultant: 0 },
      { name: 'Aisha Patel', email: 'aisha.patel@outlook.com', phone: '+1-555-1002', consultant: 2 },
      { name: 'John O\'Brien', email: 'john.obrien@protonmail.com', phone: '+44-7700-1003', consultant: 2 },
      { name: 'Yuki Tanaka', email: 'yuki.tanaka@email.jp', phone: '+81-90-1004', consultant: 1 },
      { name: 'Fatima Al-Rashid', email: 'fatima.ar@gmail.com', phone: '+971-50-1005', consultant: 5 },
      { name: 'Carlos Mendez', email: 'carlos.mendez@hotmail.com', phone: '+1-555-1006', consultant: 0 },
      { name: 'Sofia Petrova', email: 'sofia.petrova@mail.ru', phone: '+7-999-1007', consultant: 3 },
      { name: 'Daniel Okafor', email: 'daniel.okafor@gmail.com', phone: '+234-80-1008', consultant: 4 },
      { name: 'Hannah Schmidt', email: 'hannah.schmidt@web.de', phone: '+49-170-1009', consultant: 5 },
      { name: 'Kevin Nguyen', email: 'kevin.nguyen@yahoo.com', phone: '+1-555-1010', consultant: 0 },
      { name: 'Rachel Kim', email: 'rachel.kim@gmail.com', phone: '+82-10-1011', consultant: 1 },
      { name: 'Tom Whitfield', email: 'tom.whitfield@gmail.com', phone: '+44-7700-1012', consultant: 2 },
    ];

    const candIds = [];
    for (const c of candidates) {
      const { rows } = await client.query(
        `INSERT INTO candidates (name, email, phone, source_consultant_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [c.name, c.email, c.phone, consultantIds[c.consultant] || null]
      );
      candIds.push(rows[0].id);
    }
    console.log(`Inserted ${candIds.length} candidates`);

    // ── CV Submissions (various stages) ──
    const now = new Date();
    const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

    const cvSubmissions = [
      // Senior Backend Engineer (reqIds[0])
      { req: 0, cand: 0, consultant: 0, status: 'shortlisted', submitted: daysAgo(10), screened: daysAgo(8), shortlisted: daysAgo(5), fitScore: 85, rationale: 'Strong Go experience, led payments team at previous company' },
      { req: 0, cand: 1, consultant: 2, status: 'screened', submitted: daysAgo(7), screened: daysAgo(4), fitScore: 72, rationale: 'Solid backend skills, transitioning from Java to Go' },
      { req: 0, cand: 2, consultant: 2, status: 'submitted', submitted: daysAgo(2), fitScore: null, rationale: 'Rust specialist, 8 years systems programming' },
      { req: 0, cand: 9, consultant: 0, status: 'interview_scheduled', submitted: daysAgo(14), screened: daysAgo(12), shortlisted: daysAgo(10), sentToManager: daysAgo(7), interviewScheduled: daysAgo(3), fitScore: 91, rationale: 'Ex-Stripe, built payment processing at scale' },

      // VP Sales APAC (reqIds[1])
      { req: 1, cand: 3, consultant: 1, status: 'sent_to_manager', submitted: daysAgo(12), screened: daysAgo(10), shortlisted: daysAgo(8), sentToManager: daysAgo(4), fitScore: 78, rationale: '15 years enterprise SaaS in APAC, knows the market' },
      { req: 1, cand: 10, consultant: 1, status: 'submitted', submitted: daysAgo(1), fitScore: null, rationale: 'Strong sales track record in South Korea' },

      // PM AI/ML (reqIds[2])
      { req: 2, cand: 4, consultant: 5, status: 'shortlisted', submitted: daysAgo(6), screened: daysAgo(4), shortlisted: daysAgo(2), fitScore: 88, rationale: 'PhD in ML, 5 years product management at Google AI' },
      { req: 2, cand: 5, consultant: 0, status: 'rejected', submitted: daysAgo(8), screened: daysAgo(6), fitScore: 35, rationale: 'Marketing background, no technical PM experience', rejectionReason: 'Insufficient technical background for AI/ML product role' },

      // CFO (reqIds[3])
      { req: 3, cand: 6, consultant: 3, status: 'screened', submitted: daysAgo(5), screened: daysAgo(3), fitScore: 82, rationale: 'CFO at 2 pre-IPO companies, strong financial controls background' },

      // Head of People (reqIds[4])
      { req: 4, cand: 7, consultant: 4, status: 'shortlisted', submitted: daysAgo(9), screened: daysAgo(7), shortlisted: daysAgo(4), fitScore: 76, rationale: 'Scaled people ops at fast-growing startup from 100 to 400' },

      // DevOps Lead (reqIds[5])
      { req: 5, cand: 8, consultant: 5, status: 'submitted', submitted: daysAgo(1), fitScore: null, rationale: 'AWS certified, 6 years K8s experience' },
      { req: 5, cand: 11, consultant: 2, status: 'screened', submitted: daysAgo(5), screened: daysAgo(2), fitScore: 68, rationale: 'Strong Terraform skills, lighter on Kubernetes' },
    ];

    const cvIds = [];
    for (const cv of cvSubmissions) {
      const { rows } = await client.query(
        `INSERT INTO cv_submissions (requisition_id, candidate_id, consultant_id, consultant_rationale, status,
          submitted_at, screened_at, shortlisted_at, sent_to_manager_at, interview_scheduled_at,
          fit_score, rejection_reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $6)
         RETURNING id`,
        [
          reqIds[cv.req], candIds[cv.cand], consultantIds[cv.consultant], cv.rationale, cv.status,
          cv.submitted, cv.screened || null, cv.shortlisted || null, cv.sentToManager || null, cv.interviewScheduled || null,
          cv.fitScore, cv.rejectionReason || null
        ]
      );
      cvIds.push(rows[0].id);
    }
    console.log(`Inserted ${cvIds.length} CV submissions`);

    // ── Interview Slots (for Senior Backend Engineer req) ──
    const tomorrow = new Date(now.getTime() + 86400000);
    const dayAfter = new Date(now.getTime() + 2 * 86400000);
    const slots = [
      { req: 0, interviewer: 'Alex Thompson', email: 'alex.t@company.com', start: new Date(tomorrow.setHours(10, 0, 0)), booked: true },
      { req: 0, interviewer: 'Alex Thompson', email: 'alex.t@company.com', start: new Date(tomorrow.setHours(14, 0, 0)), booked: false },
      { req: 0, interviewer: 'Alex Thompson', email: 'alex.t@company.com', start: new Date(dayAfter.setHours(11, 0, 0)), booked: false },
      { req: 2, interviewer: 'Raj Patel', email: 'raj.p@company.com', start: new Date(dayAfter.setHours(15, 0, 0)), booked: false },
    ];

    const slotIds = [];
    for (const s of slots) {
      const end = new Date(s.start.getTime() + 60 * 60000);
      const { rows } = await client.query(
        `INSERT INTO interview_slots (requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes, is_booked)
         VALUES ($1, $2, $3, $4, $5, 60, $6) RETURNING id`,
        [reqIds[s.req], s.interviewer, s.email, s.start.toISOString(), end.toISOString(), s.booked]
      );
      slotIds.push(rows[0].id);
    }

    // ── Interview Booking (Kevin Nguyen booked for slot 0) ──
    await client.query(
      `INSERT INTO interview_bookings (slot_id, cv_submission_id, candidate_id, status)
       VALUES ($1, $2, $3, 'confirmed')`,
      [slotIds[0], cvIds[3], candIds[9]]  // Kevin's CV submission, first slot
    );

    // ── Hiring Outcomes (for analytics) ──
    const outcomes = [
      { req: 6, consultant: 1, rf: 'Marketing', cand: null, submitted: true, interviewed: true, offered: true, accepted: true, days: 28 },
      { req: 0, consultant: 0, rf: 'Engineering', cand: 0, submitted: true, interviewed: true, offered: false, accepted: false, days: null },
      { req: 0, consultant: 2, rf: 'Engineering', cand: 1, submitted: true, interviewed: false, offered: false, accepted: false, days: null },
      { req: 1, consultant: 1, rf: 'Sales', cand: 3, submitted: true, interviewed: true, offered: false, accepted: false, days: null },
      { req: 2, consultant: 5, rf: 'Product', cand: 4, submitted: true, interviewed: true, offered: true, accepted: false, days: null },
      { req: 3, consultant: 3, rf: 'Finance', cand: 6, submitted: true, interviewed: false, offered: false, accepted: false, days: null },
    ];

    for (const o of outcomes) {
      await client.query(
        `INSERT INTO hiring_outcomes (requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [reqIds[o.req], consultantIds[o.consultant], rfMap[o.rf], o.cand !== null ? candIds[o.cand] : null, o.submitted, o.interviewed, o.offered, o.accepted, o.days]
      );
    }
    console.log('Inserted hiring outcomes');

    // ── Briefing (for Kevin Nguyen's interview) ──
    await client.query(
      `INSERT INTO briefings (cv_submission_id, candidate_id, requisition_id, status, summary, transcript)
       VALUES ($1, $2, $3, 'completed', $4, $5)`,
      [
        cvIds[3], candIds[9], reqIds[0],
        'Kevin demonstrated strong technical depth in payment systems and distributed architecture. Confident communicator with clear examples of leadership. Recommended to proceed to final round.',
        JSON.stringify([
          { role: 'assistant', content: 'Hi Kevin! Thanks for taking the time for this pre-briefing. Can you tell me about your experience building payment systems at scale?' },
          { role: 'user', content: 'Sure! At Stripe, I led a team of 8 engineers building the core payment processing pipeline. We handled over 10 million transactions per day with 99.99% uptime.' },
          { role: 'assistant', content: 'Impressive scale. How did you approach ensuring reliability at that volume?' },
          { role: 'user', content: 'We used a combination of circuit breakers, graceful degradation, and extensive chaos engineering. I introduced a weekly game day practice that caught 3 critical failure modes before they hit production.' },
        ])
      ]
    );
    console.log('Inserted briefing data');

    await client.query('COMMIT');
    console.log('\nSeed completed successfully! Test data is ready.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
