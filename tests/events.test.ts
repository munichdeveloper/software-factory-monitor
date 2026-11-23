import { describe, expect, it, vi } from 'vitest';
import {
  eventLabel,
  fetchEvents,
  latestByIssue,
  issueEvent,
  repositoryRefusal,
  type RuntimeEvent,
} from '../src/lib/events';

const event = (
  id: number,
  type: string,
  at: string,
  data: RuntimeEvent['data'],
  issueNumber = 7,
  repository = 'o/r',
): RuntimeEvent => ({
  id,
  repository,
  type,
  issueNumber,
  executionId: null,
  at,
  recordedAt: at,
  data,
});

describe('runtime events', () => {
  it('labels events in German from fixed codes', () => {
    expect(
      eventLabel(
        event(1, 'validation_failed', 't', {
          reason: 'CHECK_FAILED',
          steps: [{ name: 'browser', exitCode: 1 }],
          next: 'rework',
        }),
      ),
    ).toBe('Validierung: browser fehlgeschlagen, Nachbesserung folgt');
    expect(
      eventLabel(event(1, 'start_refused', 't', { code: 'EXECUTOR_WRAPPER_RELEASE_MISMATCH' })),
    ).toBe('Start abgelehnt: Release passt nicht, wartet auf Rollout');
    expect(eventLabel(event(1, 'rescue_started', 't', { tier: 3, attempt: 2 }))).toBe(
      'Rettungsversuch mit stärkerem Modell läuft',
    );
    expect(eventLabel(event(1, 'attention_required', 't', { reason: 'retries_exhausted' }))).toBe(
      'Braucht dich: alle Versuche aufgebraucht',
    );
  });
  it('keeps the latest event per issue and a repository-wide refusal until a later start', () => {
    const events = [
      event(1, 'run_failed', '2026-11-20T01:00:00Z', {}),
      event(2, 'start_refused', '2026-11-20T02:00:00Z', { code: 'X', repositoryWide: true }, 8),
      event(3, 'validation_failed', '2026-11-20T00:30:00Z', {}),
      event(4, 'run_failed', '2026-11-20T03:00:00Z', {}, 9, 'other/repo'),
    ];
    expect(latestByIssue(events, 'o/r').get(7)!.id).toBe(1);
    expect(repositoryRefusal(events, 'o/r')!.id).toBe(2);
    expect(
      repositoryRefusal(
        [...events, event(5, 'start_resumed', '2026-11-20T02:05:00Z', {}, 8)],
        'o/r',
      ),
    ).toBeNull();
    expect(repositoryRefusal(events, 'other/repo')).toBeNull();
  });
  it('drops a refusal the live view no longer shows (geschaeftsideen-web#54)', () => {
    const refused = event(1, 'start_refused', '2026-11-21T16:27:02Z', {
      code: 'EXECUTOR_WRAPPER_RELEASE_MISMATCH',
      repositoryWide: true,
    });
    const latest = latestByIssue([refused], 'o/r');
    const before = { observedAt: '2026-11-21T16:30:00Z', stages: new Map([[7, 'refused']]) };
    const after = { observedAt: '2026-11-21T20:00:00Z', stages: new Map([[7, 'awaiting-pr']]) };
    const stale = { observedAt: '2026-11-21T16:00:00Z', stages: new Map([[7, 'awaiting-pr']]) };
    expect(repositoryRefusal([refused], 'o/r', before)!.id).toBe(1);
    expect(issueEvent(latest, 7, before)!.id).toBe(1);
    expect(repositoryRefusal([refused], 'o/r', after)).toBeNull();
    expect(issueEvent(latest, 7, after)).toBeUndefined();
    // A view older than the refusal says nothing about it.
    expect(repositoryRefusal([refused], 'o/r', stale)!.id).toBe(1);
    expect(repositoryRefusal([refused], 'o/r')!.id).toBe(1);
  });
  it('drops attention_required once the live view shows the issue running', () => {
    const blocked = event(1, 'attention_required', '2026-11-23T10:00:00Z', {
      reason: 'blocked_without_pr',
    });
    const latest = latestByIssue([blocked], 'o/r');
    const view = (observedAt: string, stage: string) => ({
      observedAt,
      stages: new Map([[7, stage]]),
    });
    expect(issueEvent(latest, 7, view('2026-11-23T10:08:00Z', 'running'))).toBeUndefined();
    expect(issueEvent(latest, 7, view('2026-11-23T10:08:00Z', 'blocked'))!.id).toBe(1);
    expect(issueEvent(latest, 7, view('2026-11-23T09:50:00Z', 'running'))!.id).toBe(1);
    expect(issueEvent(latest, 7, { observedAt: '2026-11-23T10:08:00Z', stages: new Map() })!.id).toBe(1);
  });
  it('reads the last 24 hours and shows nothing where the broker has no events yet', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ events: [event(1, 'run_failed', 't', { error: null })] }),
    );
    const now = new Date('2026-11-20T12:00:00Z');
    expect(
      await fetchEvents(
        'http://runtime-broker:8095',
        'token',
        now,
        fetcher as unknown as typeof fetch,
      ),
    ).toHaveLength(1);
    expect(String((fetcher.mock.calls[0] as unknown as [URL])[0])).toContain(
      'since=2026-11-19T12%3A00%3A00.000Z',
    );
    expect(
      await fetchEvents(
        'http://runtime-broker:8095',
        'token',
        now,
        (async () => new Response(null, { status: 404 })) as unknown as typeof fetch,
      ),
    ).toEqual([]);
  });
});
