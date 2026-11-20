import type { QueueEntry, QueueRun } from './queue';
import { reasonLabels, stageLabels } from './labels';

/**
 * A task's way through the Factory as a pipeline: start, coding, independent validation, the pull request's checks,
 * the AI review and the merge. Derived from the broker's queue entry only. An older broker without attempts and merge
 * progress still gets a pipeline from the stage alone.
 */
export const pipelineSteps = [
  'start',
  'coding',
  'validation',
  'checks',
  'review',
  'merge',
] as const;
export type PipelineStepKey = (typeof pipelineSteps)[number];
/**
 * done: finished; current: the Factory works on it now; waiting: waits for the Factory (slot, next pass, retry);
 * person: waits for a person; failed: failed or rejected; pending: not reached yet; skipped: not part of this run.
 */
export type StepState =
  'done' | 'current' | 'waiting' | 'person' | 'failed' | 'pending' | 'skipped';
export interface PipelineStep {
  key: PipelineStepKey;
  label: string;
  state: StepState;
  note: string | null;
}

export const stepLabels: Record<PipelineStepKey, string> = {
  start: 'Start',
  coding: 'Coding',
  validation: 'Validierung',
  checks: 'PR-Checks',
  review: 'KI-Review',
  merge: 'Merge',
};
export const stepStateLabels: Record<StepState, string> = {
  done: 'erledigt',
  current: 'läuft',
  waiting: 'wartet',
  person: 'wartet auf dich',
  failed: 'fehlgeschlagen',
  pending: 'ausstehend',
  skipped: 'entfällt',
};
export const runKindLabels: Record<string, string> = {
  first: 'Erster Versuch',
  retry: 'Wiederholung',
  rework: 'Nacharbeit (Validierung)',
  review: 'Nacharbeit (Review)',
  conflict: 'Konfliktlösung',
};
const riskLabels: Record<string, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
  critical: 'kritisch',
};
const reason = (code: string | null) => (code ? (reasonLabels[code] ?? code) : null);
const join = (...parts: (string | null | undefined | false)[]) =>
  parts
    .filter((p): p is string => !!p)
    .map((p) => p.replace(/\.$/, ''))
    .join(' · ') || null;

/** Where the attempt in progress or last finished stands, as a short note on the coding step. */
function attemptNote(entry: QueueEntry, run: QueueRun | undefined, index: number) {
  if (!run)
    return entry.attempts.used ? `Versuch ${entry.attempts.used}/${entry.attempts.max}` : null;
  return join(
    `Versuch ${index}/${entry.attempts.max}`,
    run.kind !== 'first' && (runKindLabels[run.kind] ?? run.kind),
    run.model,
  );
}

/** Applies the merge pass's progress to the steps after the validation. */
function mergeSteps(
  entry: QueueEntry,
  set: (key: PipelineStepKey, state: StepState, note?: string | null) => void,
) {
  const merge = entry.merge;
  const later = entry.stage === 'retry' ? 'Nacharbeit folgt' : null;
  if (entry.mergedAt || merge?.step === 'merged') {
    set('checks', 'done');
    set('review', 'done', merge?.risk ? `Risiko ${riskLabels[merge.risk] ?? merge.risk}` : null);
    set('merge', 'done');
    return;
  }
  if (!merge) {
    if (entry.stage === 'closed') {
      set('checks', 'skipped');
      set('review', 'skipped');
      set('merge', 'skipped', 'ohne Merge geschlossen');
    } else if (entry.stage === 'awaiting-pr') {
      // No merge pass reached this pull request (merging off, or not since the broker started): a person merges.
      set('checks', 'pending');
      set('review', 'pending');
      set('merge', 'person', 'PR prüfen und mergen');
    }
    return;
  }
  const risk = merge.risk ? `Risiko ${riskLabels[merge.risk] ?? merge.risk}` : null;
  switch (merge.step) {
    case 'checks':
      set('checks', 'current', merge.detail);
      return;
    case 'branch-update':
      set('checks', 'current', join('Branch wird auf die Basis aktualisiert', merge.detail));
      return;
    case 'checks-failed':
      set('checks', 'failed', merge.detail);
      return;
    case 'conflict':
      set('checks', 'failed', join('Merge-Konflikt mit der Basis', later));
      return;
    case 'review':
      set('checks', 'done');
      set('review', 'current', join(risk, merge.detail));
      return;
    case 'review-rejected':
      set('checks', 'done');
      set('review', 'failed', join(merge.detail, risk, later));
      return;
    case 'handover':
      set('checks', 'done');
      set('review', 'person', join(merge.detail, risk, 'Übergabe an dich'));
      return;
    case 'approval-required':
      set('checks', 'done');
      set('review', 'done', risk);
      set('merge', 'person', merge.detail);
      return;
    case 'gate':
      set('checks', 'done');
      set('review', 'done', risk);
      set('merge', 'waiting', merge.detail);
      return;
    case 'merging':
      set('checks', 'done');
      set('review', 'done', risk);
      set('merge', 'current');
      return;
    case 'stopped':
      set('merge', 'person', merge.detail);
      return;
    case 'error':
      set('merge', 'failed', join(merge.detail, 'nächster Durchlauf versucht es erneut'));
      return;
    default:
      set('merge', 'waiting', merge.step);
  }
}

export function pipeline(entry: QueueEntry): PipelineStep[] {
  const steps = new Map<PipelineStepKey, PipelineStep>(
    pipelineSteps.map((key) => [
      key,
      { key, label: stepLabels[key], state: 'pending', note: null },
    ]),
  );
  const set = (key: PipelineStepKey, state: StepState, note: string | null = null) => {
    steps.set(key, { key, label: stepLabels[key], state, note });
  };
  const runs = entry.runs;
  const latest = runs.at(-1);
  const running = latest?.active || (!runs.length && !!entry.run);
  const startStages = ['queued', 'awaiting-grant', 'awaiting-approval', 'refused', 'starting'];
  const retryWaiting = entry.stage === 'retry' && !running;

  // Start: grant, slot and admission. Done once an attempt ran.
  if (!running && startStages.includes(entry.stage)) {
    const text =
      entry.stage === 'queued' && entry.waitsForSlot
        ? 'Wartet auf freien Slot'
        : stageLabels[entry.stage];
    const state: StepState =
      entry.stage === 'refused'
        ? 'failed'
        : entry.stage === 'awaiting-grant' || entry.stage === 'awaiting-approval'
          ? 'person'
          : entry.stage === 'starting'
            ? 'current'
            : 'waiting';
    set('start', state, join(text, entry.stage === 'refused' && reason(entry.reason)));
    // A further attempt waiting for its grant or slot keeps the earlier attempts visible on the coding step.
    if (latest)
      set(
        'coding',
        'waiting',
        join(attemptNote(entry, latest, runs.length), 'nächster Versuch wartet'),
      );
    return [...steps.values()];
  }
  if (entry.stage === 'blocked' && !runs.length && !entry.run) {
    set('start', 'person', reason(entry.reason));
    return [...steps.values()];
  }
  set('start', 'done');

  // Coding and its independent validation (both run in the same runner: validation starts after the agent).
  if (running) {
    const phase = latest?.phase ?? entry.run?.phase ?? null;
    if (phase === 'awaiting-approval')
      set(
        'coding',
        'person',
        join('wartet auf Freigabe im Manager', attemptNote(entry, latest, runs.length)),
      );
    else set('coding', 'current', attemptNote(entry, latest, runs.length));
    set('validation', 'pending', 'folgt im selben Lauf');
    return [...steps.values()];
  }
  if (!latest) {
    // Older broker: the stage is all there is.
    if (['awaiting-pr', 'closed'].includes(entry.stage)) {
      set('coding', 'done', attemptNote(entry, undefined, 0));
      set('validation', 'done');
    } else if (entry.stage === 'retry' || entry.stage === 'failed' || entry.stage === 'blocked') {
      const validation = entry.reason === 'CHECK_FAILED';
      set(
        'coding',
        validation ? 'done' : entry.stage === 'retry' ? 'waiting' : 'failed',
        attemptNote(entry, undefined, 0),
      );
      if (validation)
        set(
          'validation',
          'failed',
          join(reason(entry.reason), entry.stage === 'retry' && 'Nacharbeit folgt'),
        );
      else if (entry.stage !== 'retry')
        set('coding', 'failed', join(attemptNote(entry, undefined, 0), reason(entry.reason)));
      return [...steps.values()];
    }
    mergeSteps(entry, set);
    return [...steps.values()];
  }

  const attempt = attemptNote(entry, latest, runs.length);
  if (latest.outcome === 'failed' || latest.outcome === 'cancelled' || latest.outcome === null) {
    const why = latest.infrastructure
      ? 'Runner-Einrichtung fehlgeschlagen (kostet keinen Versuch)'
      : reason(latest.error);
    set(
      'coding',
      retryWaiting ? 'waiting' : 'failed',
      join(attempt, why, retryWaiting && 'Wiederholung geplant'),
    );
    return [...steps.values()];
  }
  if (latest.outcome === 'needs_approval') {
    set('coding', 'person', join(attempt, 'Worker fragt nach Freigabe'));
    return [...steps.values()];
  }
  const validationFailed = latest.validation && latest.validation !== 'passed';
  if (latest.outcome === 'blocked' && !validationFailed) {
    set('coding', retryWaiting ? 'waiting' : 'person', join(attempt, 'Worker hat abgebrochen'));
    set('validation', latest.validation === 'passed' ? 'done' : 'skipped');
    return [...steps.values()];
  }
  set('coding', 'done', attempt);
  if (validationFailed) {
    set(
      'validation',
      'failed',
      join(
        reason(entry.reason) ?? latest.validation,
        retryWaiting ? 'Nacharbeit folgt' : entry.stage === 'blocked' ? 'Nacharbeit nötig' : null,
      ),
    );
    return [...steps.values()];
  }
  set(
    'validation',
    latest.validation === 'passed' ? 'done' : 'skipped',
    latest.validation === 'passed' ? null : 'nicht konfiguriert',
  );
  mergeSteps(entry, set);
  return [...steps.values()];
}
