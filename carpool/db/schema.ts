import { pgTable, uuid, varchar, date, time, pgEnum, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';

export const slotType = pgEnum('slot_type', ['pickup', 'drop']);
export const responsibilityScope = pgEnum('responsibility_scope', ['all_children', 'own_child_only']);

export const parents = pgTable('parents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  pinHash: varchar('pin_hash', { length: 255 }).notNull(), // bcrypt hash of a 4-digit PIN
});

export const children = pgTable('children', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id').references(() => parents.id).notNull(),
});

// One row per child, per day, per type. Covers both the 07:00/15:00 default
// (FR-001) and any per-child override of it (FR-002) — an override is just an
// edit to the row, so there is no separate "exceptions" table to reconcile.
export const scheduleSlots = pgTable('schedule_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  childId: uuid('child_id').references(() => children.id).notNull(),
  date: date('date').notNull(),
  type: slotType('type').notNull(),
  time: time('time').notNull(),
  responsibleParentId: uuid('responsible_parent_id').references(() => parents.id), // null = unassigned (FR-004)
  responsibilityScope: responsibilityScope('responsibility_scope'),
}, (t) => ({
  // Lazy generation can race if two parents open the same week at once; the
  // unique constraint makes the insert idempotent instead of duplicating rows.
  oneSlotPerChildPerDayPerType: uniqueIndex('schedule_slots_child_date_type_idx')
    .on(t.childId, t.date, t.type),
}));

export const adHocEvents = pgTable('adhoc_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  date: date('date').notNull(),
  time: time('time').notNull(),
  type: slotType('type').notNull(),
  responsibleParentId: uuid('responsible_parent_id').references(() => parents.id),
  responsibilityScope: responsibilityScope('responsibility_scope'),
  createdBy: uuid('created_by').references(() => parents.id).notNull(), // only the creator may delete (FR-010)
});

// An ad-hoc event can involve 1, 2, or all 3 children (FR-005).
export const adHocEventChildren = pgTable('adhoc_event_children', {
  eventId: uuid('event_id').references(() => adHocEvents.id, { onDelete: 'cascade' }).notNull(),
  childId: uuid('child_id').references(() => children.id).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.eventId, t.childId] }) }));
