import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { cookieOptions } from '@/lib/auth';
import { allowedUser, env, sessionSecret } from '@/lib/env';
import { sessionCookie, sessionHours, sign, stateCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';
const back = (error?: string) =>
  Response.redirect(new URL(error ? `/login?error=${error}` : '/', env().APP_URL), 302);
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Finishes the GitHub login: only allowlisted GitHub user IDs get a session. The GitHub token is not kept. */
export async function GET(request: Request) {
  const url = new URL(request.url),
    jar = await cookies();
  const state = url.searchParams.get('state') ?? '',
    code = url.searchParams.get('code') ?? '',
    expected = jar.get(stateCookie)?.value ?? '';
  jar.delete(stateCookie);
  if (!code || !expected || !same(state, expected)) return back('state');
  let token: string | undefined;
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env().GITHUB_OAUTH_CLIENT_ID,
        client_secret: env().GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${env().APP_URL}/api/auth/callback`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    token = ((await response.json()) as { access_token?: string }).access_token;
  } catch {
    return back('github');
  }
  if (!token) return back('github');
  let user: { id?: number; login?: string };
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    user = (await response.json()) as typeof user;
  } catch {
    return back('github');
  }
  if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string') return back('github');
  if (!allowedUser(user.id!)) return back('denied');
  jar.set(
    sessionCookie,
    sign(
      { id: user.id!, login: user.login, exp: Date.now() + sessionHours * 3600000 },
      sessionSecret(),
    ),
    cookieOptions(sessionHours * 3600),
  );
  return back();
}
