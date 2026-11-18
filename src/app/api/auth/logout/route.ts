import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { sessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';
/** POST only (a form on the page), with the same-origin check browsers send on form posts. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(env().APP_URL).origin)
    return Response.json({ error: 'ORIGIN' }, { status: 403 });
  (await cookies()).delete(sessionCookie);
  return Response.redirect(new URL('/login', env().APP_URL), 303);
}
