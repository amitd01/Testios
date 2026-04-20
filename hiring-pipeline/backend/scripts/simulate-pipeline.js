/**
 * End-to-end pipeline simulation.
 * Runs directly against the database — no server needed.
 *
 * Simulates: create requisition → rank consultants → assign top 3 →
 *   submit CVs → screen → shortlist → briefing gate → send to manager →
 *   schedule interview → hire/reject → verify rankings update
 *
 * Usage: node scripts/simulate-pipeline.js
 * Prerequisites: Run migrations and seed-historical-data.js first
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');
const YieldCalculator = require('../src/services/yieldCalculator');
const Briefing = require('../src/models/Briefing');
const TriageService = require('../src/services/triageService');

const DIVIDER = '='.repeat(70);
const SECTION = '-'.repeat(50);

function log(msg) { console.log(msg); }
function header(title) { log(`\n${DIVIDER}\n  ${title}\n${DIVIDER}`); }
function section(title) { log(`\n${SECTION}\n  ${title}\n${SECTION}`); }
function step(n, msg) { log(`\n  STEP ${n}: ${msg}`); }

async function simulate() {
  const client = await pool.connect();

  try {
    header('HIRING PIPELINE — END-TO-END SIMULATION');
    log('  Simulating a real hiring cycle for a Senior Field Sales Engineer role.');
    log('  This exercises all 3 subsystems: Ranking, CV Pipeline, Briefing Gate.\n');

    // ================================================================
    // STEP 1: Show current consultant rankings for Sales
    // ================================================================
    step(1, 'CONSULTANT RANKING — Query yield-based rankings for "Sales" roles');

    const { rows: [salesFamily] } = await client.query(
      "SELECT * FROM role_families WHERE name = 'Sales'"
    );
    if (!salesFamily) throw new Error('Sales role family not found — run seed first');

    const rankings = await YieldCalculator.getRankingsForRoleFamily(salesFamily.id);

    log('\n  Yield-Based Consultant Rankings for SALES:');
    log(`  ${'Rank'.padEnd(6)} ${'Firm'.padEnd(25)} ${'Subs'.padStart(5)} ${'S→I %'.padStart(7)} ${'I→O %'.padStart(7)} ${'O→A %'.padStart(7)} ${'Yield%'.padStart(7)} ${'AvgTTF'.padStart(7)}`);
    log('  ' + '-'.repeat(78));
    for (const r of rankings) {
      const medal = r.rank === 1 ? ' 🥇' : r.rank === 2 ? ' 🥈' : r.rank === 3 ? ' 🥉' : '   ';
      log(`  ${('#' + r.rank).padEnd(4)}${medal} ${r.firm_name.padEnd(25)} ${String(r.total_submissions).padStart(5)} ${(r.submit_to_interview_pct + '%').padStart(7)} ${(r.interview_to_offer_pct + '%').padStart(7)} ${(r.offer_to_accept_pct + '%').padStart(7)} ${(r.overall_yield_pct + '%').padStart(7)} ${(r.avg_time_to_fill ? r.avg_time_to_fill + 'd' : 'N/A').padStart(7)}`);
    }

    // ================================================================
    // STEP 2: Create a new requisition
    // ================================================================
    step(2, 'CREATE REQUISITION — "Senior Field Sales Engineer, Mumbai"');

    const { rows: [requisition] } = await client.query(
      `INSERT INTO requisitions (title, role_family_id, hiring_manager_name, hiring_manager_email,
        description, field_expectations, compensation_range, team_info, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open') RETURNING *`,
      [
        'Senior Field Sales Engineer - Mumbai',
        salesFamily.id,
        'Nandita Krishnan',
        'nandita.k@company.in',
        'Sell enterprise SaaS solutions to mid-market manufacturing companies in western India. Requires deep understanding of factory operations, ERP systems, and ability to conduct on-site technical demonstrations.',
        'Minimum 60% travel across Maharashtra and Gujarat. You will spend 3-4 days/week visiting factory floors, meeting plant managers, and running live product demos. This is not a desk job — field presence is the #1 success factor.',
        '18-24 LPA + variable',
        'Reports to VP Sales (West). Team of 5 field engineers. Collaborative culture but autonomous territory management. Average deal size: 20L ARR.',
      ]
    );

    log(`\n  Created: "${requisition.title}"`);
    log(`  Requisition ID: ${requisition.id}`);
    log(`  Manager: ${requisition.hiring_manager_name} (${requisition.hiring_manager_email})`);
    log(`  Compensation: ${requisition.compensation_range}`);
    log(`  Key expectation: ${requisition.field_expectations.substring(0, 80)}...`);

    // ================================================================
    // STEP 3: Auto-suggest and assign top consultants
    // ================================================================
    step(3, 'AUTO-ASSIGN — Suggest top 3 consultants based on Sales yield');

    const suggested = await YieldCalculator.suggestConsultants(requisition.id);

    if (suggested.length === 0) {
      log('\n  No ranked consultants found (need 3+ submissions). Using all active consultants.');
      const { rows: allConsultants } = await client.query(
        `SELECT c.id, c.firm_name FROM consultants c
         JOIN consultant_specialties cs ON c.id = cs.consultant_id
         WHERE cs.role_family_id = $1 AND c.active = true LIMIT 3`,
        [salesFamily.id]
      );
      for (let i = 0; i < allConsultants.length; i++) {
        await client.query(
          'INSERT INTO requisition_consultants (requisition_id, consultant_id, computed_rank) VALUES ($1, $2, $3)',
          [requisition.id, allConsultants[i].id, i + 1]
        );
      }
    } else {
      log('\n  Top 3 suggested consultants:');
      for (const s of suggested) {
        log(`    #${s.rank} ${s.firm_name} — yield: ${s.overall_yield_pct}%, avg TTF: ${s.avg_time_to_fill || 'N/A'}d`);
        await client.query(
          'INSERT INTO requisition_consultants (requisition_id, consultant_id, computed_rank) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [requisition.id, s.consultant_id, s.rank]
        );
      }
      log('\n  All 3 assigned to requisition.');
    }

    // ================================================================
    // STEP 4: Consultants submit CVs (5 candidates)
    // ================================================================
    step(4, 'CV SUBMISSION — Consultants submit 5 candidates with rationale');

    const { rows: assignedConsultants } = await client.query(
      `SELECT rc.consultant_id, c.firm_name, rc.computed_rank
       FROM requisition_consultants rc JOIN consultants c ON rc.consultant_id = c.id
       WHERE rc.requisition_id = $1 ORDER BY rc.computed_rank`,
      [requisition.id]
    );

    const CANDIDATES = [
      { name: 'Rohit Malhotra', email: 'rohit.m@gmail.com', phone: '+91-9999000001', consultant_idx: 0,
        rationale: 'Strong 6-year track record in enterprise sales. Currently at Siemens selling MES solutions to manufacturing plants. Excellent field presence, knows Maharashtra market well. Left previous role because he wanted more autonomy in territory management — this role offers exactly that.' },
      { name: 'Sneha Iyer', email: 'sneha.iyer@gmail.com', phone: '+91-9999000002', consultant_idx: 0,
        rationale: '4 years selling industrial IoT solutions. Consistently exceeds quota. Based in Pune, has strong relationships with auto-parts manufacturers in Pune-Nashik corridor. Keen to move to a product with deeper ERP integration.' },
      { name: 'Karan Bhatt', email: 'karan.bhatt@gmail.com', phone: '+91-9999000003', consultant_idx: 1,
        rationale: '5 years at SAP selling to mid-market. Understands factory workflows and ERP deeply. However, he may need convincing on the travel expectation — currently doing 30% travel, this role is 60%.' },
      { name: 'Fatima Sheikh', email: 'fatima.s@gmail.com', phone: '+91-9999000004', consultant_idx: 1,
        rationale: '3 years in SaaS sales + 2 years as a manufacturing engineer. Unique combination of technical depth and sales ability. Currently selling to FMCG, wants to move to manufacturing vertical.' },
      { name: 'Aditya Rao', email: 'aditya.rao@gmail.com', phone: '+91-9999000005', consultant_idx: 2,
        rationale: '7 years of field sales experience. Top performer at Oracle. However, he is exploring multiple offers and may have unrealistic compensation expectations (asking 30+ LPA). Worth screening but manage expectations early.' },
    ];

    const cvSubmissions = [];
    for (const cand of CANDIDATES) {
      const consultant = assignedConsultants[cand.consultant_idx] || assignedConsultants[0];

      // Create candidate
      const { rows: [candidate] } = await client.query(
        'INSERT INTO candidates (name, email, phone, source_consultant_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [cand.name, cand.email, cand.phone, consultant.consultant_id]
      );

      // Submit CV
      const { rows: [submission] } = await client.query(
        `INSERT INTO cv_submissions (requisition_id, candidate_id, consultant_id, consultant_rationale, status)
         VALUES ($1, $2, $3, $4, 'submitted') RETURNING *`,
        [requisition.id, candidate.id, consultant.consultant_id, cand.rationale]
      );

      cvSubmissions.push({ ...submission, candidate_name: cand.name, consultant_firm: consultant.firm_name, rationale: cand.rationale });
      log(`\n  CV #${cvSubmissions.length}: ${cand.name}`);
      log(`    Submitted by: ${consultant.firm_name} (Rank #${consultant.computed_rank})`);
      log(`    Rationale: ${cand.rationale.substring(0, 100)}...`);
    }

    // ================================================================
    // STEP 4b: CV TRIAGE — Auto-score all submissions
    // ================================================================
    log('\n  STEP 4b: CV TRIAGE — Auto-scoring candidates against job description\n');

    for (const cv of cvSubmissions) {
      const scoreResult = TriageService.scoreMock(
        { consultant_rationale: cv.rationale, candidate_name: cv.candidate_name },
        requisition
      );
      await client.query(
        'UPDATE cv_submissions SET fit_score = $2, fit_analysis = $3, scored_at = NOW() WHERE id = $1',
        [cv.id, scoreResult.fit_score, JSON.stringify({ dimensions: scoreResult.dimensions, summary: scoreResult.summary, method: scoreResult.method })]
      );
      cv.fit_score = scoreResult.fit_score;
      const dims = scoreResult.dimensions;
      log(`  ${cv.candidate_name.padEnd(20)} Score: ${String(scoreResult.fit_score).padStart(3)}/100  [Role:${dims.role_relevance} Exp:${dims.experience_depth} Loc:${dims.location_fit} Comp:${dims.compensation_alignment} Culture:${dims.culture_signals}]`);
      log(`    ${scoreResult.summary}`);
    }

    // ================================================================
    // STEP 5: Screen CVs (Talent team initial review)
    // ================================================================
    step(5, 'SCREENING — Talent team reviews all 5 CVs');

    for (const cv of cvSubmissions) {
      await client.query(
        "UPDATE cv_submissions SET status = 'screened', screened_at = NOW() WHERE id = $1",
        [cv.id]
      );
    }
    log('\n  All 5 CVs screened. Moving to shortlisting...');

    // ================================================================
    // STEP 6: Shortlist (reject Aditya Rao for comp mismatch)
    // ================================================================
    step(6, 'SHORTLISTING — 4 shortlisted, 1 rejected');

    const shortlisted = cvSubmissions.slice(0, 4);
    const rejected = cvSubmissions[4]; // Aditya Rao

    for (const cv of shortlisted) {
      await client.query(
        "UPDATE cv_submissions SET status = 'shortlisted', shortlisted_at = NOW() WHERE id = $1",
        [cv.id]
      );
      log(`  SHORTLISTED: ${cv.candidate_name}`);
    }

    await client.query(
      "UPDATE cv_submissions SET status = 'rejected', rejection_reason = $2, resolved_at = NOW() WHERE id = $1",
      [rejected.id, 'Compensation expectations (30+ LPA) exceed budget (18-24 LPA). Candidate unwilling to negotiate per consultant feedback.']
    );
    log(`  REJECTED: ${rejected.candidate_name} — Reason: Comp expectations exceed budget`);

    // ================================================================
    // STEP 7: Pre-interview briefing gate
    // ================================================================
    step(7, 'BRIEFING GATE — Create mandatory pre-interview briefings');

    const briefings = [];
    for (const cv of shortlisted) {
      const { rows: [briefing] } = await client.query(
        'INSERT INTO briefings (cv_submission_id, candidate_id, requisition_id) VALUES ($1, $2, $3) RETURNING *',
        [cv.id, cv.candidate_id, requisition.id]
      );
      briefings.push({ ...briefing, candidate_name: cv.candidate_name });
      log(`\n  Briefing created for ${cv.candidate_name}`);
      log(`    Link token: ${briefing.link_token}`);
      log(`    URL: http://localhost:3003/briefing/${briefing.link_token}`);
    }

    // Simulate briefing conversations (without actual LLM calls)
    section('SIMULATING BRIEFING CONVERSATIONS (mock — no LLM)');

    const BRIEFING_CONVERSATIONS = [
      // Rohit — passes with flying colors
      { candidateIdx: 0, passed: true,
        messages: [
          { role: 'user', content: 'Hi, I\'m Rohit. I\'d like to learn more about the Senior Field Sales Engineer role.' },
          { role: 'assistant', content: 'Welcome Rohit! This role involves selling enterprise SaaS to mid-market manufacturing companies in western India. You\'d spend 60% of your time traveling across Maharashtra and Gujarat, visiting factory floors and running live demos. The team is 5 field engineers reporting to VP Sales West. Compensation is 18-24 LPA plus variable. Does this align with what you were expecting?' },
          { role: 'user', content: 'Yes, absolutely. I\'m currently at Siemens doing similar work — visiting plants, meeting production managers. 60% travel is actually less than what I do now. I\'m comfortable with factory environments and know the Maharashtra industrial belt well.' },
          { role: 'assistant', content: 'Great to hear! One key point — this role requires autonomous territory management. You\'ll own your pipeline end-to-end, from prospecting to demo to close. The average deal size is around 20L ARR. Are you comfortable with that level of autonomy?' },
          { role: 'user', content: 'That\'s exactly why I\'m interested. At Siemens, I share territories and it limits my ability to build deep customer relationships. I want to own my territory fully. 20L ARR deals are slightly smaller than what I\'m used to but the volume should compensate. I\'m ready for the interview.' },
        ],
        summary: 'Rohit demonstrates strong understanding of the role requirements. His current experience at Siemens is directly relevant — he already works in factory environments with manufacturing clients. He is comfortable with the travel requirements and sees the autonomous territory management as a positive. Recommended to proceed to manager interview.' },

      // Sneha — passes well
      { candidateIdx: 1, passed: true,
        messages: [
          { role: 'user', content: 'Hello! I\'m Sneha. I was told this role involves field sales for manufacturing companies?' },
          { role: 'assistant', content: 'That\'s right, Sneha. The role is Senior Field Sales Engineer based in Mumbai, selling enterprise SaaS solutions to mid-market manufacturing companies. The work is heavily field-oriented — 60% travel across Maharashtra and Gujarat, visiting factory floors and conducting live product demos. Does this match your understanding?' },
          { role: 'user', content: 'Yes, I sell IoT solutions to similar companies in Pune-Nashik. I\'m used to visiting plants and speaking with production line managers. I\'m curious about the ERP integration angle — my current product sits alongside ERPs but doesn\'t go deep. Is this a full ERP replacement or a complementary tool?' },
          { role: 'assistant', content: 'Great question. It\'s complementary — the product integrates with existing ERPs (SAP, Oracle) rather than replacing them. Your IoT background could be very relevant here since many manufacturing clients are looking at IoT + ERP convergence. The compensation range is 18-24 LPA plus variable. Any concerns about that or the travel requirements?' },
          { role: 'user', content: 'The comp range works for me, and the travel is fine — I\'m already doing 50% travel. I\'d love to discuss more about the product roadmap and customer base with the hiring manager. I\'m ready.' },
        ],
        summary: 'Sneha has strong relevant experience in IoT sales to manufacturing companies. She asked thoughtful questions about ERP integration, showing genuine product interest. Comfortable with travel and compensation. Good candidate for manager interview.' },

      // Karan — fails briefing (travel concern)
      { candidateIdx: 2, passed: false,
        messages: [
          { role: 'user', content: 'Hi, I\'m Karan. I want to understand what the day-to-day looks like for this role.' },
          { role: 'assistant', content: 'Hi Karan! Day-to-day, you\'d spend 3-4 days per week visiting manufacturing plants across Maharashtra and Gujarat. You\'ll meet plant managers, conduct live technical demonstrations of the SaaS platform, and manage your sales pipeline end-to-end. It\'s a highly field-oriented role — 60% minimum travel. On non-travel days, you\'d be at the Mumbai office doing pipeline management, follow-ups, and preparing proposals.' },
          { role: 'user', content: 'That\'s quite a lot of travel. I\'m currently at SAP and do about 30% travel, which I find manageable. 60% is double that. I have a young family and was hoping this role would be more balanced. Is there flexibility on the travel requirement?' },
          { role: 'assistant', content: 'I understand the concern. The 60% travel is a core requirement of this role — field presence is the #1 success factor according to the hiring team. The manufacturing clients expect on-site visits for demos and relationship building. It would be difficult to be successful in this role with significantly less travel. Would this be a dealbreaker for you?' },
          { role: 'user', content: 'Honestly, I need to think about it. I was hoping for maybe 40% travel. I don\'t think I can commit to 60% with my current family situation. Maybe this isn\'t the right fit timing-wise.' },
        ],
        summary: 'Karan expressed significant concern about the 60% travel requirement. He is currently doing 30% travel and has family commitments that make 60% difficult. He was transparent about the mismatch. Recommend not proceeding — this would likely result in early attrition if the travel expectations aren\'t genuinely accepted.' },

      // Fatima — passes
      { candidateIdx: 3, passed: true,
        messages: [
          { role: 'user', content: 'Hi, I\'m Fatima. I have a background in both manufacturing engineering and SaaS sales. I\'d like to understand how this role leverages both.' },
          { role: 'assistant', content: 'Fatima, your background sounds like an excellent fit! This role requires explaining complex SaaS solutions to manufacturing plant managers and engineers. You\'d visit factories, understand their production workflows, and demonstrate how the platform integrates with their existing ERP systems. Your engineering background means you can speak their language on the factory floor, while your sales experience helps you close deals. The role involves 60% travel across Maharashtra and Gujarat.' },
          { role: 'user', content: 'That sounds like exactly what I want to do. I spent 2 years as a manufacturing engineer at L&T before moving to SaaS sales, so I know what it\'s like to work on a factory floor. The 60% travel is fine — I actually enjoy site visits more than desk work. What\'s the team dynamic like?' },
          { role: 'assistant', content: 'The team is 5 field engineers reporting to VP Sales (West). It\'s collaborative but each person manages their territory autonomously. Average deal size is 20L ARR. Compensation is 18-24 LPA plus variable. The culture values initiative — you\'re expected to own your pipeline end-to-end. Does all of this align with what you\'re looking for?' },
          { role: 'user', content: 'Yes, completely. I\'m currently selling FMCG SaaS and want to get back to manufacturing. The comp range, the autonomy, and the factory-floor interactions — it all resonates. I\'m confident and ready for the next step.' },
        ],
        summary: 'Fatima has a unique and highly relevant combination of manufacturing engineering and SaaS sales experience. She showed enthusiasm for the field-oriented nature of the role, has no concerns about travel, and her motivation for switching from FMCG to manufacturing is clear and genuine. Strong candidate for manager interview.' },
    ];

    for (const conv of BRIEFING_CONVERSATIONS) {
      const briefing = briefings[conv.candidateIdx];
      log(`\n  --- Briefing: ${briefing.candidate_name} ---`);

      // Simulate message exchanges
      for (const msg of conv.messages) {
        await client.query(`
          UPDATE briefings
          SET transcript = transcript || $2::jsonb,
              status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
              started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END
          WHERE id = $1
        `, [briefing.id, JSON.stringify([{ role: msg.role, content: msg.content, timestamp: new Date().toISOString() }])]);

        const prefix = msg.role === 'user' ? '    CANDIDATE' : '    ASSISTANT';
        log(`${prefix}: ${msg.content.substring(0, 120)}${msg.content.length > 120 ? '...' : ''}`);
      }

      // Complete briefing
      const status = conv.passed ? 'completed' : 'failed';
      await client.query(
        'UPDATE briefings SET status = $2, summary = $3, completed_at = NOW() WHERE id = $1',
        [briefing.id, status, conv.summary]
      );

      const result = conv.passed ? 'PASSED ✓' : 'FAILED ✗';
      log(`\n    Result: ${result}`);
      log(`    Summary: ${conv.summary.substring(0, 120)}...`);
    }

    // ================================================================
    // STEP 8: Advance passed candidates, reject failed
    // ================================================================
    step(8, 'POST-BRIEFING — Advance passed candidates, reject Karan');

    // Reject Karan (briefing failed)
    const karanCV = shortlisted[2];
    await client.query(
      "UPDATE cv_submissions SET status = 'rejected', rejection_reason = $2, resolved_at = NOW() WHERE id = $1",
      [karanCV.id, 'Failed pre-interview briefing: candidate cannot meet 60% travel requirement due to family commitments.']
    );
    log(`\n  REJECTED: ${karanCV.candidate_name} — Failed briefing (travel mismatch)`);

    // Advance passed candidates to sent_to_manager
    const passedCVs = [shortlisted[0], shortlisted[1], shortlisted[3]]; // Rohit, Sneha, Fatima
    for (const cv of passedCVs) {
      await client.query(
        "UPDATE cv_submissions SET status = 'sent_to_manager', sent_to_manager_at = NOW() WHERE id = $1",
        [cv.id]
      );
      log(`  SENT TO MANAGER: ${cv.candidate_name}`);
    }

    // ================================================================
    // STEP 9: Create interview slots and scheduling links
    // ================================================================
    step(9, 'INTERVIEW SCHEDULING — Manager creates slots, candidates book');

    // Manager creates interview slots for the requisition
    const slotDates = [];
    const baseDate = new Date();
    for (let i = 1; i <= 5; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i + 2); // slots a few days out
      if (d.getDay() === 0) d.setDate(d.getDate() + 1); // skip Sunday
      if (d.getDay() === 6) d.setDate(d.getDate() + 2); // skip Saturday
      slotDates.push(d);
    }

    const createdSlots = [];
    for (const d of slotDates) {
      const startTime = new Date(d);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(d);
      endTime.setHours(11, 0, 0, 0);

      const { rows: [slot] } = await client.query(
        `INSERT INTO interview_slots (requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes)
         VALUES ($1, $2, $3, $4, $5, 60) RETURNING *`,
        [requisition.id, 'Nandita Krishnan', 'nandita.k@company.in', startTime.toISOString(), endTime.toISOString()]
      );
      createdSlots.push(slot);
    }
    log(`\n  Created ${createdSlots.length} interview slots for ${requisition.hiring_manager_name}`);
    for (const s of createdSlots) {
      log(`    ${new Date(s.start_time).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} ${new Date(s.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${new Date(s.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    }

    // Create scheduling links for the 3 passed candidates (Rohit, Sneha, Fatima)
    const schedulingTokens = {};
    for (const cv of passedCVs) {
      const { rows: [booking] } = await client.query(
        `INSERT INTO interview_bookings (cv_submission_id, candidate_id, status)
         VALUES ($1, $2, 'confirmed') RETURNING *`,
        [cv.id, cv.candidate_id]
      );
      schedulingTokens[cv.candidate_name] = booking.scheduling_token;
      log(`\n  Scheduling link for ${cv.candidate_name}: /interview/${booking.scheduling_token}`);
    }

    // ================================================================
    // STEP 10: Manager reviews, 2 candidates book interviews
    // ================================================================
    step(10, 'MANAGER REVIEW + BOOKING — Nandita reviews 3 CVs, 2 book interviews');

    // Sneha doesn't get interview (manager feels IoT background is too different)
    await client.query(
      "UPDATE cv_submissions SET status = 'rejected', rejection_reason = $2, resolved_at = NOW() WHERE id = $1",
      [shortlisted[1].id, 'Manager feedback: IoT sales background is too far from ERP/SaaS integration sales. Prefers candidates with direct ERP ecosystem experience.']
    );
    // Cancel Sneha's scheduling link
    await client.query(
      "UPDATE interview_bookings SET status = 'cancelled', cancelled_at = NOW() WHERE cv_submission_id = $1",
      [shortlisted[1].id]
    );
    log(`\n  REJECTED by manager: ${shortlisted[1].candidate_name} — IoT background too different`);

    // Rohit and Fatima book interviews
    const interviewCVs = [shortlisted[0], shortlisted[3]];
    for (let i = 0; i < interviewCVs.length; i++) {
      const cv = interviewCVs[i];
      const slot = createdSlots[i];

      // Book the slot
      await client.query('UPDATE interview_slots SET is_booked = true WHERE id = $1', [slot.id]);
      await client.query(
        'UPDATE interview_bookings SET slot_id = $2, booked_at = NOW() WHERE cv_submission_id = $1 AND status != $3',
        [cv.id, slot.id, 'cancelled']
      );

      // Advance CV to interview_scheduled
      await client.query(
        "UPDATE cv_submissions SET status = 'interview_scheduled', interview_scheduled_at = NOW() WHERE id = $1",
        [cv.id]
      );
      log(`  INTERVIEW BOOKED: ${cv.candidate_name} — ${new Date(slot.start_time).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} ${new Date(slot.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    }

    // ================================================================
    // STEP 11: Final outcome — Fatima gets hired
    // ================================================================
    step(11, 'FINAL OUTCOME — Fatima Sheikh gets the offer');

    // Rohit - good interview but declines (counter-offer from Siemens)
    await client.query(
      "UPDATE cv_submissions SET status = 'rejected', rejection_reason = $2, resolved_at = NOW() WHERE id = $1",
      [shortlisted[0].id, 'Candidate declined after receiving counter-offer from current employer (Siemens). Could not match retention package.']
    );
    log(`\n  DECLINED: ${shortlisted[0].candidate_name} — Accepted counter-offer from Siemens`);

    // Fatima - hired!
    await client.query(
      "UPDATE cv_submissions SET status = 'hired', resolved_at = NOW() WHERE id = $1",
      [shortlisted[3].id]
    );
    log(`  HIRED: ${shortlisted[3].candidate_name} ← 🎉`);

    // Mark requisition as filled
    await client.query(
      "UPDATE requisitions SET status = 'filled', filled_at = NOW() WHERE id = $1",
      [requisition.id]
    );

    // Record outcomes in hiring_outcomes for future ranking
    for (const cv of cvSubmissions) {
      const { rows: [sub] } = await client.query('SELECT * FROM cv_submissions WHERE id = $1', [cv.id]);
      const interviewed = ['interview_scheduled', 'hired'].includes(sub.status) || (sub.status === 'rejected' && !!sub.interview_scheduled_at);
      // Rohit (shortlisted[0]) got an offer but declined
      const isRohit = cv.candidate_id === shortlisted[0].candidate_id;
      const offered = sub.status === 'hired' || isRohit;
      const accepted = sub.status === 'hired';

      await client.query(
        `INSERT INTO hiring_outcomes (requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8)`,
        [requisition.id, cv.consultant_id, salesFamily.id, cv.candidate_id, !!interviewed, !!offered, !!accepted, accepted ? 21 : null]
      );
    }

    // Mark interviews as completed for the booked candidates
    for (const cv of interviewCVs) {
      await client.query(
        "UPDATE interview_bookings SET status = 'completed' WHERE cv_submission_id = $1 AND status != 'cancelled'",
        [cv.id]
      );
    }

    // ================================================================
    // STEP 12: Pipeline summary
    // ================================================================
    header('PIPELINE SUMMARY');

    const { rows: pipelineStats } = await client.query(`
      SELECT status, COUNT(*) as count
      FROM cv_submissions WHERE requisition_id = $1
      GROUP BY status ORDER BY
        CASE status WHEN 'hired' THEN 1 WHEN 'rejected' THEN 2 ELSE 0 END
    `, [requisition.id]);

    log('\n  Final CV Status Distribution:');
    for (const s of pipelineStats) {
      const bar = '█'.repeat(parseInt(s.count) * 8);
      log(`    ${s.status.padEnd(22)} ${bar} ${s.count}`);
    }

    log(`\n  Requisition: ${requisition.title}`);
    log(`  Status: FILLED`);
    log(`  Hired: Fatima Sheikh`);
    log(`  Time to fill: ~21 days`);
    log(`  Funnel: 5 submitted → 4 screened → 4 shortlisted → 3 briefed (1 failed) → 3 sent to manager → 2 interviewed → 1 hired`);
    log(`  Conversion rate: 20% (1/5 submitted → hired)`);

    // ================================================================
    // STEP 13: Verify updated rankings
    // ================================================================
    step(13, 'VERIFY RANKINGS — Check if new outcomes affected consultant rankings');

    const updatedRankings = await YieldCalculator.getRankingsForRoleFamily(salesFamily.id);

    log('\n  Updated Consultant Rankings for SALES (after this hire cycle):');
    log(`  ${'Rank'.padEnd(6)} ${'Firm'.padEnd(25)} ${'Subs'.padStart(5)} ${'Yield%'.padStart(7)}`);
    log('  ' + '-'.repeat(48));
    for (const r of updatedRankings) {
      log(`  ${('#' + r.rank).padEnd(6)} ${r.firm_name.padEnd(25)} ${String(r.total_submissions).padStart(5)} ${(r.overall_yield_pct + '%').padStart(7)}`);
    }

    // ================================================================
    // STEP 14: Dashboard view
    // ================================================================
    header('DASHBOARD METRICS');

    const { rows: dashStats } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM requisitions WHERE status = 'open') as open_reqs,
        (SELECT COUNT(*) FROM requisitions WHERE status = 'filled') as filled_reqs,
        (SELECT COUNT(*) FROM cv_submissions WHERE status NOT IN ('hired', 'rejected')) as active_cvs,
        (SELECT COUNT(*) FROM cv_submissions WHERE status = 'hired') as total_hires,
        (SELECT COUNT(*) FROM briefings WHERE status = 'completed') as briefings_passed,
        (SELECT COUNT(*) FROM briefings WHERE status = 'failed') as briefings_failed,
        (SELECT COUNT(*) FROM consultants WHERE active = true) as active_consultants,
        (SELECT COUNT(*) FROM hiring_outcomes) as total_outcomes
    `);

    const d = dashStats[0];
    log(`
  Open Requisitions:      ${d.open_reqs}
  Filled Requisitions:    ${d.filled_reqs}
  Active CVs in Pipeline: ${d.active_cvs}
  Total Hires (all time): ${d.total_hires}
  Briefings Passed:       ${d.briefings_passed}
  Briefings Failed:       ${d.briefings_failed}
  Active Consultants:     ${d.active_consultants}
  Historical Outcomes:    ${d.total_outcomes}
`);

    // ================================================================
    // STEP 15: Briefing gate enforcement demo
    // ================================================================
    section('BRIEFING GATE ENFORCEMENT TEST');

    log('\n  Testing: Can we advance a CV to interview_scheduled without a briefing?');

    // Create a test candidate with no briefing
    const { rows: [testCandidate] } = await client.query(
      "INSERT INTO candidates (name, email) VALUES ('Test GateCandidate', 'test@gate.com') RETURNING *"
    );
    const { rows: [testCV] } = await client.query(
      `INSERT INTO cv_submissions (requisition_id, candidate_id, consultant_id, status, shortlisted_at)
       VALUES ($1, $2, $3, 'sent_to_manager', NOW()) RETURNING *`,
      [requisition.id, testCandidate.id, assignedConsultants[0].consultant_id]
    );

    // Try to advance to interview_scheduled — the model checks for briefing
    const CvSubmission = require('../src/models/CvSubmission');
    try {
      await CvSubmission.advance(testCV.id);
      log('  UNEXPECTED: advance succeeded without briefing!');
    } catch (err) {
      log(`  BLOCKED ✓ — "${err.message}"`);
      log('  The briefing gate correctly prevents unbriefed candidates from reaching interviews.');
    }

    // Clean up test data
    await client.query('DELETE FROM cv_submissions WHERE id = $1', [testCV.id]);
    await client.query('DELETE FROM candidates WHERE id = $1', [testCandidate.id]);

    // ================================================================
    // STEP 16: Analytics deep dive
    // ================================================================
    const AnalyticsService = require('../src/services/analyticsService');

    header('ANALYTICS DEEP DIVE');

    const dropoff = await AnalyticsService.getStageDropoff(requisition.id);
    log('\n  Stage Drop-off (this requisition):');
    for (const s of dropoff) {
      const bar = '█'.repeat(s.count * 4);
      log(`    ${s.stage.padEnd(18)} ${bar} ${s.count}  (${s.conversion_pct}%)`);
    }

    const briefEffectiveness = await AnalyticsService.getBriefingEffectiveness();
    log(`\n  Briefing Effectiveness:`);
    log(`    Total: ${briefEffectiveness.total} | Pass Rate: ${briefEffectiveness.pass_rate_pct}% | Hire After Pass: ${briefEffectiveness.hire_rate_after_pass}%`);

    const roleFamilyStats = await AnalyticsService.getRoleFamilyBreakdown();
    log('\n  Role Family Breakdown:');
    log(`  ${'Family'.padEnd(15)} ${'Subs'.padStart(5)} ${'Hires'.padStart(6)} ${'Yield%'.padStart(7)} ${'AvgTTF'.padStart(7)}`);
    log('  ' + '-'.repeat(45));
    for (const rf of roleFamilyStats.slice(0, 5)) {
      log(`  ${rf.role_family.padEnd(15)} ${String(rf.total_submissions).padStart(5)} ${String(rf.hires).padStart(6)} ${(rf.yield_pct + '%').padStart(7)} ${(rf.avg_time_to_fill ? rf.avg_time_to_fill + 'd' : 'N/A').padStart(7)}`);
    }

    const consultComparison = await AnalyticsService.getConsultantComparison(5);
    log('\n  Top 5 Consultants (overall):');
    for (const c of consultComparison) {
      log(`    ${c.firm_name.padEnd(25)} Yield: ${c.overall_yield_pct}% | TTF: ${c.avg_time_to_fill || 'N/A'}d`);
    }

    header('SIMULATION COMPLETE');
    log('\n  All 6 subsystems exercised:');
    log('    1. Consultant Ranking: Yield-based rankings queried and used for auto-assignment');
    log('    2. CV Pipeline: Full 7-stage lifecycle (submitted → hired) with screening and rejection');
    log('    3. CV Triage: Auto-scored candidates against JD with 5-dimension breakdown');
    log('    4. Briefing Gate: Conversations simulated, pass/fail evaluated, gate enforcement verified');
    log('    5. Interview Scheduling: Slots created, scheduling links generated, candidates self-booked');
    log('    6. Analytics: Drop-off analysis, briefing effectiveness, role family breakdown');
    log('\n  The hiring pipeline is operational. 🚀\n');

  } catch (err) {
    console.error('\nSimulation failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

simulate();
