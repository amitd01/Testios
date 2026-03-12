/**
 * Seeds 8 years of historical hiring data across 10 consultants and 8 role families.
 * This provides the yield data that powers consultant rankings.
 *
 * Usage: node scripts/seed-historical-data.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');

// 10 consulting firms with realistic Indian recruitment market names
const CONSULTANTS = [
  { firm_name: 'TalentBridge India', contact_name: 'Priya Sharma', contact_email: 'priya@talentbridge.in', phone: '+91-9876543210' },
  { firm_name: 'PeopleFirst Consulting', contact_name: 'Rajesh Kumar', contact_email: 'rajesh@peoplefirst.co.in', phone: '+91-9876543211' },
  { firm_name: 'HireRight Partners', contact_name: 'Anita Desai', contact_email: 'anita@hireright.in', phone: '+91-9876543212' },
  { firm_name: 'Apex Recruiters', contact_name: 'Vikram Singh', contact_email: 'vikram@apexrecruit.in', phone: '+91-9876543213' },
  { firm_name: 'NexGen Talent', contact_name: 'Meera Patel', contact_email: 'meera@nexgentalent.in', phone: '+91-9876543214' },
  { firm_name: 'CareerCraft Solutions', contact_name: 'Arjun Nair', contact_email: 'arjun@careercraft.in', phone: '+91-9876543215' },
  { firm_name: 'Pinnacle Search', contact_name: 'Kavitha Reddy', contact_email: 'kavitha@pinnaclesearch.in', phone: '+91-9876543216' },
  { firm_name: 'CoreHR Associates', contact_name: 'Suresh Menon', contact_email: 'suresh@corehr.in', phone: '+91-9876543217' },
  { firm_name: 'BlueStar Staffing', contact_name: 'Deepa Joshi', contact_email: 'deepa@bluestar.in', phone: '+91-9876543218' },
  { firm_name: 'Vanguard Talent', contact_name: 'Amit Gupta', contact_email: 'amit@vanguardtalent.in', phone: '+91-9876543219' },
];

// Specialty mapping: which consultants are strong in which role families
// Index into CONSULTANTS array -> array of role family names
const SPECIALTY_MAP = {
  0: ['Engineering', 'Product'],                    // TalentBridge - tech focused
  1: ['Sales', 'Marketing', 'Operations'],          // PeopleFirst - commercial
  2: ['Engineering', 'Finance'],                     // HireRight - analytical
  3: ['Leadership', 'Product', 'Engineering'],       // Apex - senior roles
  4: ['Sales', 'Marketing'],                         // NexGen - growth
  5: ['Operations', 'HR', 'Finance'],                // CareerCraft - ops/support
  6: ['Leadership', 'Engineering'],                  // Pinnacle - exec search
  7: ['HR', 'Operations', 'Finance'],                // CoreHR - people ops
  8: ['Engineering', 'Sales', 'Product'],            // BlueStar - generalist
  9: ['Marketing', 'Product', 'Leadership'],         // Vanguard - strategy
};

// Performance profiles per consultant (indexed same as CONSULTANTS)
// [interview_rate, offer_rate_given_interview, accept_rate_given_offer, avg_ttf_days]
const PERFORMANCE = {
  0: { Engineering: [0.75, 0.60, 0.85, 28], Product: [0.65, 0.50, 0.80, 35] },
  1: { Sales: [0.80, 0.55, 0.70, 22], Marketing: [0.70, 0.50, 0.75, 30], Operations: [0.60, 0.45, 0.80, 25] },
  2: { Engineering: [0.70, 0.65, 0.90, 32], Finance: [0.75, 0.60, 0.85, 26] },
  3: { Leadership: [0.55, 0.70, 0.95, 45], Product: [0.60, 0.55, 0.85, 38], Engineering: [0.50, 0.60, 0.80, 40] },
  4: { Sales: [0.85, 0.45, 0.65, 18], Marketing: [0.80, 0.40, 0.70, 20] },
  5: { Operations: [0.65, 0.55, 0.85, 30], HR: [0.70, 0.60, 0.80, 28], Finance: [0.55, 0.50, 0.75, 34] },
  6: { Leadership: [0.60, 0.75, 0.90, 50], Engineering: [0.55, 0.50, 0.70, 42] },
  7: { HR: [0.80, 0.65, 0.85, 24], Operations: [0.70, 0.55, 0.80, 27], Finance: [0.65, 0.50, 0.75, 30] },
  8: { Engineering: [0.60, 0.45, 0.75, 35], Sales: [0.65, 0.50, 0.70, 25], Product: [0.55, 0.40, 0.65, 38] },
  9: { Marketing: [0.75, 0.55, 0.80, 28], Product: [0.70, 0.60, 0.85, 32], Leadership: [0.50, 0.65, 0.90, 48] },
};

function coinFlip(probability) {
  return Math.random() < probability;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('\n========================================');
    console.log('  SEEDING HISTORICAL HIRING DATA');
    console.log('========================================\n');

    // 1. Get role families (already seeded by migration)
    const { rows: roleFamilies } = await client.query('SELECT * FROM role_families ORDER BY name');
    const rfMap = {};
    roleFamilies.forEach(rf => { rfMap[rf.name] = rf.id; });
    console.log(`Found ${roleFamilies.length} role families: ${roleFamilies.map(r => r.name).join(', ')}`);

    // 2. Insert consultants
    console.log('\nInserting 10 consultants...');
    const consultantIds = [];
    for (let i = 0; i < CONSULTANTS.length; i++) {
      const c = CONSULTANTS[i];
      const { rows } = await client.query(
        `INSERT INTO consultants (firm_name, contact_name, contact_email, phone, notes, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT DO NOTHING RETURNING *`,
        [c.firm_name, c.contact_name, c.contact_email, c.phone, `Consultant #${i + 1} - active since ${2018 + (i % 4)}`]
      );
      if (rows[0]) {
        consultantIds.push(rows[0].id);
        // Insert specialties
        for (const spec of SPECIALTY_MAP[i]) {
          if (rfMap[spec]) {
            await client.query(
              'INSERT INTO consultant_specialties (consultant_id, role_family_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [rows[0].id, rfMap[spec]]
            );
          }
        }
        console.log(`  [${i + 1}] ${c.firm_name} (${c.contact_name}) - specialties: ${SPECIALTY_MAP[i].join(', ')}`);
      } else {
        // Already exists, fetch id
        const existing = await client.query('SELECT id FROM consultants WHERE firm_name = $1', [c.firm_name]);
        consultantIds.push(existing.rows[0].id);
        console.log(`  [${i + 1}] ${c.firm_name} (already exists)`);
      }
    }

    // 3. Generate historical outcomes (~1000 hires worth of data over 8 years)
    console.log('\nGenerating ~1000 historical hiring outcomes (8 years of data)...');
    let totalOutcomes = 0;
    let totalHires = 0;
    const outcomesByConsultant = {};

    for (let i = 0; i < consultantIds.length; i++) {
      const consultantId = consultantIds[i];
      const perf = PERFORMANCE[i];
      outcomesByConsultant[CONSULTANTS[i].firm_name] = { submitted: 0, interviewed: 0, offered: 0, accepted: 0 };

      for (const [roleName, rates] of Object.entries(perf)) {
        const rfId = rfMap[roleName];
        if (!rfId) continue;

        const [intRate, offerRate, acceptRate, avgTtf] = rates;
        // Each consultant submits 8-25 candidates per role family over 8 years
        const submissions = randomInt(8, 25);

        for (let s = 0; s < submissions; s++) {
          const interviewed = coinFlip(intRate);
          const offered = interviewed && coinFlip(offerRate);
          const accepted = offered && coinFlip(acceptRate);
          const ttf = accepted ? avgTtf + randomInt(-10, 15) : null;

          await client.query(
            `INSERT INTO hiring_outcomes (consultant_id, role_family_id, submitted, interviewed, offered, accepted, time_to_fill_days)
             VALUES ($1, $2, true, $3, $4, $5, $6)`,
            [consultantId, rfId, interviewed, offered, accepted, ttf]
          );

          totalOutcomes++;
          if (accepted) totalHires++;

          const stats = outcomesByConsultant[CONSULTANTS[i].firm_name];
          stats.submitted++;
          if (interviewed) stats.interviewed++;
          if (offered) stats.offered++;
          if (accepted) stats.accepted++;
        }
      }
    }

    console.log(`\n  Total outcomes recorded: ${totalOutcomes}`);
    console.log(`  Total hires: ${totalHires}`);
    console.log(`  Overall conversion rate: ${(totalHires / totalOutcomes * 100).toFixed(1)}%\n`);

    // 4. Print consultant performance summary
    console.log('--- Consultant Performance Summary ---');
    console.log(`${'Firm'.padEnd(25)} ${'Sub'.padStart(5)} ${'Int'.padStart(5)} ${'Off'.padStart(5)} ${'Hire'.padStart(5)} ${'Yield'.padStart(7)}`);
    console.log('-'.repeat(60));
    for (const [firm, stats] of Object.entries(outcomesByConsultant)) {
      const yieldPct = stats.submitted > 0 ? (stats.accepted / stats.submitted * 100).toFixed(1) : '0.0';
      console.log(`${firm.padEnd(25)} ${String(stats.submitted).padStart(5)} ${String(stats.interviewed).padStart(5)} ${String(stats.offered).padStart(5)} ${String(stats.accepted).padStart(5)} ${(yieldPct + '%').padStart(7)}`);
    }

    console.log('\nSeed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
