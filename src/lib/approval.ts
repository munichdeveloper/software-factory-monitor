import type { MergeProgress, QueueEntry, QueueView } from './queue';

/**
 * Approving a pull request from the monitor (merge step "approval-required").
 *
 * The Factory merges a pull request above its risk threshold only after a comment `/harness approve <id>` on that pull
 * request by someone with write access to the repository (software-factory src/merge/manager.ts). The monitor posts
 * exactly that comment, as the signed-in person: a user access token of the monitor's GitHub App, asked for with a
 * second authorisation at the moment of approval, used for this one comment and then discarded. GitHub only lets that
 * token comment where the App is installed with "Pull requests: write". The comment's author is the approving person, so
 * the Factory's own check of who approved stays the only authority; the monitor never posts with an App or service
 * credential and only ever posts an id the broker currently asks for.
 */
export const approvalCookie = 'sfmon-approval';
/** The OAuth step at approval time must finish within this time. */
export const approvalMinutes = 5;

const commandPattern = /\/harness approve ([a-f0-9]{64})/;
const idPattern = /^[a-f0-9]{64}$/;
const repositoryPattern = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

export type ApprovalTarget = { repository: string; pullRequest: number; approvalId: string };

export const approvalCommand = (approvalId: string) => `/harness approve ${approvalId}`;

/** Merge steps at which the broker may offer an approval: the risk gate and a review that handed over or deferred. */
const approvalSteps = ['approval-required', 'review-rejected', 'handover'];

export type PendingApproval = {
  pullRequest: number;
  approvalId: string;
  /** True when the approval overrules a deferral by the review (the broker offers it for review-rejected/handover). */
  overrides: boolean;
};

/** The approval a pull request waits for, read from the broker's merge progress; null if the broker offers none. */
export function pendingApprovalOf(merge: MergeProgress | null): PendingApproval | null {
  if (!merge || !approvalSteps.includes(merge.step) || !merge.detail) return null;
  const match = merge.detail.match(commandPattern);
  if (!match || !Number.isSafeInteger(merge.pullRequest) || merge.pullRequest <= 0) return null;
  return {
    pullRequest: merge.pullRequest,
    approvalId: match[1]!,
    overrides: merge.step !== 'approval-required',
  };
}

/** The approval a task's pull request waits for; null if none. */
export const pendingApproval = (entry: QueueEntry) => pendingApprovalOf(entry.merge);

/** The merge-progress text without the command, for where the monitor offers the button instead. */
export function withoutCommand(detail: string | null): string | null {
  if (!detail) return detail;
  const text = detail
    .replace(/\s*Freigeben mit diesem Kommentar am PR:\s*\/harness approve [a-f0-9]{64}\.?/, '')
    .replace(/\s*\/harness approve [a-f0-9]{64}/, '')
    .trim();
  return text || null;
}

/** Whether the broker's current view still asks for exactly this approval. */
export function isCurrent(view: QueueView, target: ApprovalTarget): boolean {
  const repository = view.repositories.find((r) => r.repository === target.repository);
  const offered = [
    ...(repository?.entries ?? []).map((e) => pendingApproval(e)),
    ...(repository?.pullRequests ?? []).map((pr) => pendingApprovalOf(pr.merge)),
  ];
  return offered.some(
    (pending) =>
      pending?.pullRequest === target.pullRequest && pending.approvalId === target.approvalId,
  );
}

/** Validates the form fields of an approval request; null for anything malformed. */
export function parseTarget(input: {
  repository: unknown;
  pullRequest: unknown;
  approvalId: unknown;
}): ApprovalTarget | null {
  const { repository, pullRequest, approvalId } = input;
  if (typeof repository !== 'string' || !repositoryPattern.test(repository)) return null;
  if (typeof approvalId !== 'string' || !idPattern.test(approvalId)) return null;
  const number = typeof pullRequest === 'string' ? Number(pullRequest) : NaN;
  if (!/^[1-9][0-9]{0,9}$/.test(String(pullRequest)) || !Number.isSafeInteger(number)) return null;
  return { repository, pullRequest: number, approvalId };
}

/** What the page says after an approval attempt (query `freigabe`). */
export const approvalResultLabels: Record<string, string> = {
  ok: 'Freigabe als Kommentar am PR gepostet. Die Factory mergt beim nächsten Merge-Durchlauf, wenn sich nichts geändert hat.',
  demo: 'Demo: Es wurde nichts gepostet.',
  APPROVAL_STALE:
    'Die Factory wartet nicht mehr auf diese Freigabe (neuer Stand am PR oder schon erledigt). Bitte die Ansicht aktualisieren.',
  APPROVAL_INVALID: 'Ungültige Freigabe-Anfrage.',
  APPROVAL_EXPIRED:
    'Die Freigabe hat zu lange gedauert oder wurde abgebrochen. Bitte erneut versuchen.',
  APPROVAL_WRONG_ACCOUNT:
    'Bei GitHub ist ein anderes Konto angemeldet als im Monitor. Es wurde nichts gepostet.',
  APPROVAL_DENIED: 'Die Freigabe wurde bei GitHub nicht bestätigt. Es wurde nichts gepostet.',
  APPROVAL_GITHUB_UNREACHABLE: 'GitHub ist nicht erreichbar. Es wurde nichts gepostet.',
  APPROVAL_TOKEN_REJECTED: 'GitHub hat die Anmeldung abgelehnt. Bitte erneut versuchen.',
  APPROVAL_FORBIDDEN:
    'GitHub hat den Kommentar abgelehnt: Die GitHub-App des Monitors braucht die Berechtigung „Pull requests: Read and write“ und muss in diesem Repository installiert sein.',
  APPROVAL_GITHUB_FAILED: 'GitHub hat den Kommentar nicht angenommen. Bitte erneut versuchen.',
  APPROVAL_QUEUE_UNAVAILABLE:
    'Die Factory-Laufzeit ist nicht erreichbar; ohne ihren aktuellen Stand wird nichts gepostet.',
};
