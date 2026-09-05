import { db } from '@/db/client';
import { children, parents } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import { getEvent } from '@/lib/schedule';
import EventForm from './EventForm';

export const dynamic = 'force-dynamic';

/** Doubles as the edit form when ?id= is present — same fields, same validation. */
export default async function NewEventPage({ searchParams }: { searchParams: { id?: string } }) {
  const sessionParentId = (await getSessionParentId())!;
  const [parentRows, childRows, existing] = await Promise.all([
    db.select({ id: parents.id, name: parents.name }).from(parents),
    db.select({ id: children.id, name: children.name, parentId: children.parentId }).from(children),
    searchParams.id ? getEvent(searchParams.id) : Promise.resolve(null),
  ]);

  return (
    <EventForm
      parents={parentRows}
      children={childRows}
      sessionParentId={sessionParentId}
      existing={existing}
    />
  );
}
