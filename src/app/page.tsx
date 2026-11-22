import { redirect } from 'next/navigation';
import { QueueBoard } from '@/components/queue-board';
import { currentUser } from '@/lib/auth';
import { loadQueue } from '@/lib/load';

export const dynamic = 'force-dynamic';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const params = await searchParams;
  const result = typeof params.freigabe === 'string' ? params.freigabe : null;
  const id = typeof params.id === 'string' && /^[a-f0-9]{64}$/.test(params.id) ? params.id : null;
  return (
    <QueueBoard
      initial={await loadQueue()}
      login={user.login}
      approval={result ? { result, id } : null}
    />
  );
}
