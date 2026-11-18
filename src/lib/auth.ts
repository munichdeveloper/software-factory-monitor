import { cookies } from 'next/headers';
import { allowedUser, demoMode, sessionSecret } from './env';
import { sessionCookie, verify, type Session } from './session';

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
/** The signed-in, still allowlisted GitHub user, or null. */
export async function currentUser(): Promise<Session | null> {
  if (demoMode()) return { id: 0, login: 'demo', exp: Number.MAX_SAFE_INTEGER };
  const session = verify((await cookies()).get(sessionCookie)?.value, sessionSecret());
  return session && allowedUser(session.id) ? session : null;
}
