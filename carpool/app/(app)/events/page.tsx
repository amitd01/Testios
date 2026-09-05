import { db } from '@/db/client';
import { children, parents } from '@/db/schema';
import { getSessionParentId } from '@/lib/session';
import { getEvents } from '@/lib/schedule';
import EventList from './EventList';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const sessionParentId = (await getSessionParentId())!;
  const [events, parentRows, childRows] = await Promise.all([
    getEvents('0001-01-01', '9999-12-31'),
    db.select({ id: parents.id, name: parents.name }).from(parents),
    db.select({ id: children.id, name: children.name, parentId: children.parentId }).from(children),
  ]);

  return (
    <EventList
      events={events}
      parents={parentRows}
      children={childRows}
      sessionParentId={sessionParentId}
    />
  );
}
