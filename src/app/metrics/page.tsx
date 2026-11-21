import { redirect } from 'next/navigation';
import { MetricsBoard } from '@/components/metrics-board';
import { analyticsQuery } from '@/lib/analytics';
import { currentUser } from '@/lib/auth';
import { loadMetrics } from '@/lib/load';

export const dynamic = 'force-dynamic';
export default async function Metrics({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[]; repository?: string | string[] }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const query = analyticsQuery(await searchParams);
  return <MetricsBoard loaded={await loadMetrics(query)} query={query} login={user.login} />;
}
