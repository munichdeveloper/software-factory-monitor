import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { approvalCookie, isCurrent } from '@/lib/approval';
import { postApproval, verifyPending } from '@/lib/approval-server';
import { currentUser } from '@/lib/auth';
import { allowedUser, env, sessionSecret } from '@/lib/env';
import { loadQueue } from '@/lib/load';

export const dynamic = 'force-dynamic';
const back = (result: string, approvalId?: string) => {
  const url = new URL('/', env().APP_URL);
  url.searchParams.set('freigabe', result);
  if (approvalId) url.searchParams.set('id', approvalId);
  return Response.redirect(url, 302);
};
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Finishes an approval: GitHub confirmed the same person who started it in the monitor, the broker still asks for
 * this approval, and the comment `/harness approve <id>` is posted with that person's token. The token is not kept.
 */
export async function GET(request: Request) {
  const url = new URL(request.url),
    jar = await cookies();
  const pending = verifyPending(jar.get(approvalCookie)?.value, sessionSecret());
  jar.delete(approvalCookie);
  const state = url.searchParams.get('state') ?? '',
    code = url.searchParams.get('code') ?? '';
  if (!pending || !same(state, pending.state)) return back('APPROVAL_EXPIRED');
  if (!code) return back('APPROVAL_DENIED');
  const user = await currentUser();
  if (!user || user.id !== pending.userId) return back('APPROVAL_EXPIRED');

  let token: string | undefined;
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env().GITHUB_OAUTH_CLIENT_ID,
        client_secret: env().GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${env().APP_URL}/api/auth/callback/approve`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    token = ((await response.json()) as { access_token?: string }).access_token;
  } catch {
    return back('APPROVAL_GITHUB_UNREACHABLE');
  }
  if (!token) return back('APPROVAL_DENIED');
  // The comment must come from the person signed in to the monitor, not from whoever is signed in to GitHub.
  let account: { id?: number };
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    account = (await response.json()) as typeof account;
  } catch {
    return back('APPROVAL_GITHUB_UNREACHABLE');
  }
  if (account.id !== pending.userId || !allowedUser(pending.userId))
    return back('APPROVAL_WRONG_ACCOUNT');

  // Still the approval the Factory waits for: a new head or review in the meantime yields a new id.
  const loaded = await loadQueue();
  if (!loaded.view) return back('APPROVAL_QUEUE_UNAVAILABLE');
  if (!isCurrent(loaded.view, pending)) return back('APPROVAL_STALE');
  try {
    await postApproval(token, pending);
  } catch (error) {
    return back(error instanceof Error ? error.message : 'APPROVAL_GITHUB_FAILED');
  }
  console.log(
    JSON.stringify({
      event: 'monitor-approval',
      repository: pending.repository,
      pullRequest: pending.pullRequest,
      githubId: pending.userId,
    }),
  );
  return back('ok', pending.approvalId);
}
