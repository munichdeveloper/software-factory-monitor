import { redirect } from 'next/navigation';
import { AnalyticsBoard } from '@/components/analytics-board';
import { analyticsQuery } from '@/lib/analytics';
import { currentUser } from '@/lib/auth';
import { loadAnalytics } from '@/lib/load';

export const dynamic = 'force-dynamic';
export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[]; repository?: string | string[] }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const query = analyticsQuery(await searchParams);
  return <AnalyticsBoard loaded={await loadAnalytics(query)} query={query} login={user.login} />;
}
