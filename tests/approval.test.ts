import { describe, expect, it, vi } from 'vitest';
import {
  isCurrent,
  pendingApprovalOf,
  parseTarget,
  pendingApproval,
  withoutCommand,
} from '../src/lib/approval';
import { postApproval, signPending, verifyPending } from '../src/lib/approval-server';
import { entryMatches, pullRequestMatches } from '../src/lib/queue';
import type { QueueEntry, QueuePullRequest, QueueView } from '../src/lib/queue';

const id = 'ab'.repeat(32);
const secret = 's'.repeat(32);
// The broker's own text for the merge step (software-factory src/merge/manager.ts).
const detail = `Risiko high über der Schwelle medium: menschliche Freigabe nötig. Freigeben mit diesem Kommentar am PR: /harness approve ${id}`;
const entry = (merge: Partial<NonNullable<QueueEntry['merge']>> | null) =>
  ({
    merge: merge && {
      pullRequest: 77,
      step: 'approval-required',
      detail,
      risk: 'high',
      at: '',
      ...merge,
    },
  }) as QueueEntry;
const view = (e: QueueEntry): QueueView =>
  ({ repositories: [{ repository: 'munichdeveloper/backofficer', entries: [e] }] }) as QueueView;
const target = { repository: 'munichdeveloper/backofficer', pullRequest: 77, approvalId: id };

describe('approval from the monitor', () => {
  it('offers an approval at approval-required, review-rejected and handover', () => {
    expect(pendingApproval(entry({}))).toEqual({
      pullRequest: 77,
      approvalId: id,
      overrides: false,
    });
    for (const step of ['review-rejected', 'handover'])
      expect(pendingApproval(entry({ step }))).toEqual({
        pullRequest: 77,
        approvalId: id,
        overrides: true,
      });
  });
  it('offers no button without an approval id from the broker', () => {
    for (const step of ['review-rejected', 'handover', 'approval-required'])
      expect(pendingApproval(entry({ step, detail: 'Review zurückgestellt.' }))).toBeNull();
    expect(pendingApprovalOf(null)).toBeNull();
  });
  it('covers adopted pull requests when checking what the broker asks for', () => {
    const pr = { number: 77, merge: entry({ step: 'handover' }).merge } as QueuePullRequest;
    const v = {
      repositories: [{ repository: target.repository, entries: [], pullRequests: [pr] }],
    } as unknown as QueueView;
    expect(isCurrent(v, target)).toBe(true);
    expect(isCurrent(v, { ...target, approvalId: 'cd'.repeat(32) })).toBe(false);
  });
  it('finds a pull request by its number and shows the issue', () => {
    const task = {
      issueNumber: 36,
      title: 'MCP 3/5: Lead-Import',
      pullRequests: ['https://github.com/o/r/pull/45'],
      merge: { pullRequest: 45 },
    } as QueueEntry;
    for (const q of ['45', '#45', ' #36 ', 'lead']) expect(entryMatches(task, q)).toBe(true);
    for (const q of ['4', '#46', 'xyz']) expect(entryMatches(task, q)).toBe(false);
    expect(entryMatches(task, '')).toBe(true);
    const pr = { number: 45, title: 'Fix' } as QueuePullRequest;
    expect(pullRequestMatches(pr, '#45')).toBe(true);
    expect(pullRequestMatches(pr, '46')).toBe(false);
    expect(pullRequestMatches(pr, 'fix')).toBe(true);
  });
  it('reads the approval id only from an approval-required merge step', () => {
    expect(pendingApproval(entry({}))).toEqual({
      pullRequest: 77,
      approvalId: id,
      overrides: false,
    });
    expect(pendingApproval(entry({ step: 'gate' }))).toBeNull();
    expect(pendingApproval(entry({ detail: 'Menschliche Freigabe nötig.' }))).toBeNull();
    expect(pendingApproval(entry(null))).toBeNull();
  });
  it('drops the command from the text shown next to the button', () => {
    expect(withoutCommand(detail)).toBe(
      'Risiko high über der Schwelle medium: menschliche Freigabe nötig.',
    );
    expect(
      withoutCommand(
        `Menschliche Freigabe nötig. Freigeben mit diesem Kommentar am PR: /harness approve ${id}`,
      ),
    ).toBe('Menschliche Freigabe nötig.');
  });
  it('posts only what the broker currently asks for', () => {
    expect(isCurrent(view(entry({})), target)).toBe(true);
    expect(isCurrent(view(entry({})), { ...target, approvalId: 'cd'.repeat(32) })).toBe(false);
    expect(isCurrent(view(entry({})), { ...target, pullRequest: 78 })).toBe(false);
    expect(isCurrent(view(entry({})), { ...target, repository: 'munichdeveloper/controla' })).toBe(
      false,
    );
    expect(isCurrent(view(entry({ step: 'merged' })), target)).toBe(false);
  });
  it('validates the form fields', () => {
    expect(
      parseTarget({ repository: target.repository, pullRequest: '77', approvalId: id }),
    ).toEqual(target);
    expect(parseTarget({ repository: '../x', pullRequest: '77', approvalId: id })).toBeNull();
    expect(
      parseTarget({ repository: target.repository, pullRequest: '7a', approvalId: id }),
    ).toBeNull();
    expect(
      parseTarget({ repository: target.repository, pullRequest: '0', approvalId: id }),
    ).toBeNull();
    expect(
      parseTarget({ repository: target.repository, pullRequest: '77', approvalId: 'x' }),
    ).toBeNull();
  });
  it('signs the pending approval separately from the session', () => {
    const pending = { ...target, userId: 731456, state: 'x'.repeat(32), exp: Date.now() + 60000 };
    const value = signPending(pending, secret);
    expect(verifyPending(value, secret)).toEqual(pending);
    expect(verifyPending(value, 't'.repeat(32))).toBeNull();
    expect(
      verifyPending(signPending({ ...pending, exp: Date.now() - 1 }, secret), secret),
    ).toBeNull();
    const [payload, signature] = value.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...pending, approvalId: 'cd'.repeat(32) }),
    ).toString('base64url');
    expect(verifyPending(`${forged}.${signature}`, secret)).toBeNull();
    expect(verifyPending(`${payload}.${signature}.x`, secret)).toBeNull();
  });
  it('posts exactly the approval command with the person token', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 201 }));
    await postApproval('user-token', target, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/munichdeveloper/backofficer/issues/77/comments');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
    expect(JSON.parse(init.body as string)).toEqual({ body: `/harness approve ${id}` });
    const refused = vi.fn(async () => new Response('{}', { status: 404 }));
    await expect(postApproval('t', target, refused as unknown as typeof fetch)).rejects.toThrow(
      'APPROVAL_FORBIDDEN',
    );
  });
});
