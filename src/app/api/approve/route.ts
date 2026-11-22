import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  approvalCookie,
  approvalMinutes,
  approvalScope,
  isCurrent,
  parseTarget,
} from '@/lib/approval';
import { signPending } from '@/lib/approval-server';
import { cookieOptions, currentUser } from '@/lib/auth';
import { demoMode, env, sessionSecret } from '@/lib/env';
import { loadQueue } from '@/lib/load';

export const dynamic = 'force-dynamic';
const appUrl = () => (demoMode() ? process.env.APP_URL || 'http://localhost:3000' : env().APP_URL);
const back = (result: string, approvalId?: string) => {
  const url = new URL('/', appUrl());
  url.searchParams.set('freigabe', result);
  if (approvalId) url.searchParams.set('id', approvalId);
  return Response.redirect(url, 303);
};

/**
 * Starts an approval from the queue page (a form post). Only for a signed-in, allowlisted person, only from the
 * monitor's own page, and only for an approval the broker currently asks for. The comment itself is posted after a
 * GitHub authorisation of the same person (see /api/auth/callback/approve), with their own token.
 */
export async function POST(request: Request) {
  // Browsers send Origin on every form post; a missing or foreign one is refused.
  if (request.headers.get('origin') !== new URL(appUrl()).origin)
    return Response.json({ error: 'ORIGIN' }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.redirect(new URL('/login', appUrl()), 303);
  const form = await request.formData().catch(() => null);
  const target = form
    ? parseTarget({
        repository: form.get('repository'),
        pullRequest: form.get('pullRequest'),
        approvalId: form.get('approvalId'),
      })
    : null;
  if (!target) return back('APPROVAL_INVALID');
  const loaded = await loadQueue();
  if (!loaded.view) return back('APPROVAL_QUEUE_UNAVAILABLE');
  if (!isCurrent(loaded.view, target)) return back('APPROVAL_STALE');
  if (demoMode()) return back('demo', target.approvalId);

  const state = randomBytes(24).toString('base64url');
  (await cookies()).set(
    approvalCookie,
    signPending(
      { ...target, userId: user.id, state, exp: Date.now() + approvalMinutes * 60000 },
      sessionSecret(),
    ),
    cookieOptions(approvalMinutes * 60),
  );
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: env().GITHUB_OAUTH_CLIENT_ID,
    // A subdirectory of the OAuth App's registered callback, so the App needs no change.
    redirect_uri: `${env().APP_URL}/api/auth/callback/approve`,
    scope: approvalScope,
    state,
    login: user.login,
    allow_signup: 'false',
  }).toString();
  return Response.redirect(url, 303);
}
