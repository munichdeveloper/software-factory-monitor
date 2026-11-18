import { redirect } from 'next/navigation';
import { QueueBoard } from '@/components/queue-board';
import { currentUser } from '@/lib/auth';
import { loadQueue } from '@/lib/load';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <QueueBoard initial={await loadQueue()} login={user.login} />;
}
