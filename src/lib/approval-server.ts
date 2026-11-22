import { createHmac, timingSafeEqual } from 'node:crypto';
import { approvalCommand, parseTarget, type ApprovalTarget } from './approval';

/** Server-only part of the monitor's approval (see ./approval.ts): the signed pending cookie and the GitHub post. */
export type PendingApproval = ApprovalTarget & { userId: number; state: string; exp: number };

// The pending approval rides in a signed cookie across the OAuth step; its MAC is separated from the session's.
const mac = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(`approval:${payload}`).digest('base64url');

export function signPending(pending: PendingApproval, secret: string): string {
  const payload = Buffer.from(JSON.stringify(pending)).toString('base64url');
  return `${payload}.${mac(payload, secret)}`;
}
export function verifyPending(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): PendingApproval | null {
  if (!value || value.length > 1500) return null;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(payload, secret)),
    given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PendingApproval;
    const target = parseTarget({
      repository: p.repository,
      pullRequest: String(p.pullRequest),
      approvalId: p.approvalId,
    });
    if (
      !target ||
      !Number.isSafeInteger(p.userId) ||
      typeof p.state !== 'string' ||
      p.state.length < 16 ||
      typeof p.exp !== 'number' ||
      p.exp <= now
    )
      return null;
    return { ...target, userId: p.userId, state: p.state, exp: p.exp };
  } catch {
    return null;
  }
}

/**
 * Posts the approval comment with the person's own token. Fixed error codes only, never GitHub's text.
 */
export async function postApproval(
  token: string,
  target: ApprovalTarget,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const url = `https://api.github.com/repos/${target.repository}/issues/${target.pullRequest}/comments`;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ body: approvalCommand(target.approvalId) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('APPROVAL_GITHUB_UNREACHABLE');
  }
  if (response.status === 401) throw new Error('APPROVAL_TOKEN_REJECTED');
  if (response.status === 403 || response.status === 404) throw new Error('APPROVAL_FORBIDDEN');
  if (!response.ok) throw new Error('APPROVAL_GITHUB_FAILED');
}
