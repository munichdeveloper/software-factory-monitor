import { describe, expect, it } from 'vitest';
import { demoQueue } from '../src/lib/demo';
import { pipeline } from '../src/lib/pipeline';
import { queueViewSchema, type QueueEntry } from '../src/lib/queue';

const entries = demoQueue(new Date('2026-11-19T12:00:00Z')).repositories.flatMap((r) => r.entries);
const of = (issue: number) => entries.find((e) => e.issueNumber === issue)!;
const states = (entry: QueueEntry) => pipeline(entry).map((s) => `${s.key}:${s.state}`);

describe('pipeline', () => {
  it('ticks finished steps, highlights the running one and leaves the rest open', () => {
    expect(states(of(214))).toEqual([
      'start:done',
      'coding:current',
      'validation:pending',
      'checks:pending',
      'review:pending',
      'merge:pending',
    ]);
    expect(pipeline(of(214))[1]!.note).toBe(
      'Versuch 2/3 · Nacharbeit (Validierung) · claude-opus-5-5',
    );
  });
  it('follows the merge pass: checks, review with risk, approval and merged', () => {
    expect(states(of(143)).slice(3)).toEqual(['checks:current', 'review:pending', 'merge:pending']);
    expect(states(of(211)).slice(3)).toEqual(['checks:done', 'review:current', 'merge:pending']);
    expect(pipeline(of(211))[4]!.note).toBe('Risiko mittel');
    expect(states(of(208)).slice(3)).toEqual(['checks:done', 'review:done', 'merge:person']);
    expect(states(of(205))).toEqual(pipeline(of(205)).map((s) => `${s.key}:done`));
  });
  it('marks a rejected review as failed with the rework that follows', () => {
    const review = pipeline(of(140))[4]!;
    expect(review.state).toBe('failed');
    expect(review.note).toBe('KI-Entscheidung: request_changes · Risiko mittel · Nacharbeit folgt');
  });
  it('shows waits before the start and a failed task at its coding step', () => {
    expect(states(of(216))[0]).toBe('start:waiting');
    expect(pipeline(of(216))[0]!.note).toBe('Wartet auf freien Slot');
    expect(states(of(142))[0]).toBe('start:person');
    expect(states(of(131))[0]).toBe('start:person');
    const coding = pipeline(of(137))[1]!;
    expect(coding.state).toBe('failed');
    expect(coding.note).toContain('Versuch 3/3 · Wiederholung');
  });
  it('marks a failed validation and the rework that follows', () => {
    const blocked: QueueEntry = {
      ...of(214),
      stage: 'retry',
      reason: 'CHECK_FAILED',
      run: null,
      runs: [of(214).runs[0]!],
    };
    expect(states(blocked).slice(1, 3)).toEqual(['coding:done', 'validation:failed']);
    expect(pipeline(blocked)[2]!.note).toBe(
      'Unabhängige Validierung: Checks fehlgeschlagen · Nacharbeit folgt',
    );
  });
  it('still draws a pipeline from the stage alone for a broker without attempts', () => {
    const old = queueViewSchema.parse({
      generatedAt: '2026-11-19T12:00:00Z',
      reconcileIntervalSeconds: 180,
      repositories: [
        {
          repositoryId: 1,
          repository: 'o/r',
          observedAt: null,
          outcome: null,
          failure: null,
          slots: null,
          entries: [
            {
              issueNumber: 1,
              title: 'T',
              url: 'https://github.com/o/r/issues/1',
              stage: 'awaiting-pr',
              status: 'awaiting-pr',
              priority: null,
              attempts: { used: 1, max: 3 },
              since: '2026-11-19T11:00:00Z',
              run: null,
              reason: null,
              retryAt: null,
              waitsForSlot: false,
              dependsOn: [],
              pullRequests: ['https://github.com/o/r/pull/2'],
            },
          ],
        },
      ],
    });
    const entry = old.repositories[0]!.entries[0]!;
    expect(entry.runs).toEqual([]);
    expect(states(entry)).toEqual([
      'start:done',
      'coding:done',
      'validation:done',
      'checks:pending',
      'review:pending',
      'merge:person',
    ]);
  });
});
