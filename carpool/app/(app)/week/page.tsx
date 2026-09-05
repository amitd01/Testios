import WeekView from './WeekView';

export const dynamic = 'force-dynamic';

export default function WeekPage({ searchParams }: { searchParams: { start?: string } }) {
  return <WeekView initialStart={searchParams.start} />;
}
