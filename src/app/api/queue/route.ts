import { currentUser } from '@/lib/auth';
import { loadQueue } from '@/lib/load';

export const dynamic = 'force-dynamic';
export async function GET() {
  if (!(await currentUser()))
    return Response.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  const loaded = await loadQueue();
  return Response.json(loaded, {
    status: loaded.error ? 502 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
