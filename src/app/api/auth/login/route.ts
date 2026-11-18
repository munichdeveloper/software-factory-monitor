import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cookieOptions } from '@/lib/auth';
import { env } from '@/lib/env';
import { stateCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';
/** Starts the GitHub login. The state lives in a short-lived cookie and is compared on the way back. */
export async function GET() {
  const state = randomBytes(24).toString('base64url');
  (await cookies()).set(stateCookie, state, cookieOptions(300));
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: env().GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: `${env().APP_URL}/api/auth/callback`,
    state,
    allow_signup: 'false',
  }).toString();
  return Response.redirect(url, 302);
}
