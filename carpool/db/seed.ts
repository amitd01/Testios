/**
 * Creates the 3 fixed parent/child pairs. There is no signup flow — this group
 * is fixed by design (product note s.2), so membership is a deploy-time concern.
 * Safe to re-run: it no-ops if parents already exist.
 */
import 'dotenv/config';
import { db } from './client';
import { children, parents } from './schema';
import { hashPin } from '../lib/auth';

const FAMILIES = [
  { parent: 'Mom A', child: 'Child A', pin: '1111' },
  { parent: 'Mom B', child: 'Child B', pin: '2222' },
  { parent: 'Mom C', child: 'Child C', pin: '3333' },
];

async function main() {
  const existing = await db.select().from(parents);
  if (existing.length > 0) {
    console.log(`Seed skipped — ${existing.length} parents already present.`);
    process.exit(0);
  }

  for (const family of FAMILIES) {
    const [parent] = await db
      .insert(parents)
      .values({ name: family.parent, pinHash: hashPin(family.pin) })
      .returning();
    await db.insert(children).values({ name: family.child, parentId: parent.id });
    console.log(`Seeded ${family.parent} / ${family.child} (PIN ${family.pin})`);
  }

  console.log('\nChange these PINs before real use.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
