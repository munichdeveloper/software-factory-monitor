import { z } from 'zod';

/**
 * The broker's runtime events (software-factory, GET /v1/events, issue #188): failed validations, refused and resumed
 * starts, failed runs and tasks that need a person. Fixed codes and numbers only. Older brokers answer 404; the
 * dashboard then shows no events.
 */
const stepSchema = z.object({ name: z.string(), exitCode: z.number().int().nullable() });
export const runtimeEventSchema = z.object({
  id: z.number().int(),
  repository: z.string(),
  type: z.string(),
  issueNumber: z.number().int(),
  executionId: z.string().nullable(),
  at: z.string(),
  recordedAt: z.string(),
  data: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(stepSchema)]),
  ),
});
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;

const refusalLabels: Record<string, string> = {
  EXECUTOR_WRAPPER_RELEASE_MISMATCH: 'Release passt nicht, wartet auf Rollout',
  UNKNOWN_WORKER_DEPLOYMENT_VERSION: 'Worker-Version auf dem Host unbekannt',
  CODING_EXECUTOR_UNAVAILABLE: 'Coding-Executor nicht erreichbar',
  WORKER_READINESS_FAILED: 'Worker nicht bereit',
  POLICY_MISMATCH: 'Policy passt nicht zur Laufzeit',
  APPROVAL_REQUIRED: 'Freigabe fehlt',
  CODING_NOT_AUTHORIZED: 'Start nicht freigegeben',
};
const attentionLabels: Record<string, string> = {
  retries_exhausted: 'alle Versuche aufgebraucht',
  rework_exhausted: 'Nachbesserungen aufgebraucht',
  blocked_without_pr: 'blockiert ohne PR',
};
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** One German line per event, e.g. "Validierung: browser fehlgeschlagen". */
export function eventLabel(e: RuntimeEvent): string {
  const code = text(e.data.code);
  switch (e.type) {
    case 'validation_failed': {
      const steps = Array.isArray(e.data.steps) ? e.data.steps.map((s) => s.name).join(', ') : '';
      return `Validierung: ${steps || text(e.data.reason)} fehlgeschlagen${e.data.next === 'rework' ? ', Nachbesserung folgt' : e.data.next === 'rescue' ? ', Rettungsversuch folgt' : ''}`;
    }
    case 'start_refused':
      return `Start abgelehnt: ${refusalLabels[code] ?? code}`;
    case 'start_resumed':
      return `Start läuft wieder (${e.data.trigger === 'cause_cleared' ? 'Ursache behoben' : e.data.trigger === 'manual' ? 'nach Änderung' : 'nach Wartezeit'})`;
    case 'run_failed':
      return `Lauf fehlgeschlagen${text(e.data.error) ? `: ${text(e.data.error)}` : ''}${e.data.infrastructure ? ' (Infrastruktur)' : ''}`;
    case 'rescue_started':
      return 'Rettungsversuch mit stärkerem Modell läuft';
    case 'attention_required':
      return `Braucht dich: ${attentionLabels[text(e.data.reason)] ?? text(e.data.reason)}`;
    default:
      return e.type;
  }
}

/** The latest event of every issue of one repository. */
export function latestByIssue(
  events: RuntimeEvent[],
  repository: string,
): Map<number, RuntimeEvent> {
  const latest = new Map<number, RuntimeEvent>();
  for (const e of events)
    if (e.repository === repository) {
      const before = latest.get(e.issueNumber);
      if (!before || before.at < e.at || (before.at === e.at && before.id < e.id))
        latest.set(e.issueNumber, e);
    }
  return latest;
}

/**
 * The broker's live view of one repository: when it was observed and the stage of every listed issue. A refusal the
 * live view no longer shows is over, even when the broker never recorded a start_resumed (geschaeftsideen-web#54:
 * the refusal cleared while the issue waited for its grant, so the later start had no refusal to resume from).
 */
export interface LiveView {
  observedAt: string | null;
  stages: ReadonlyMap<number, string>;
}
const outdated = (e: RuntimeEvent, live?: LiveView) =>
  !!live?.observedAt && live.observedAt > e.at && e.type === 'start_refused';

/**
 * A refusal that stops the whole repository, that no later start of that repository has followed and that the live
 * view still shows (some listed issue is in stage refused).
 */
export function repositoryRefusal(
  events: RuntimeEvent[],
  repository: string,
  live?: LiveView,
): RuntimeEvent | null {
  const own = events
    .filter((e) => e.repository === repository)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
  const refusal = own
    .filter((e) => e.type === 'start_refused' && e.data.repositoryWide === true)
    .at(-1);
  if (!refusal) return null;
  if (outdated(refusal, live) && ![...live!.stages.values()].includes('refused')) return null;
  return own.some(
    (e) =>
      e.at > refusal.at &&
      (e.type === 'start_resumed' || e.type === 'run_failed' || e.type === 'validation_failed'),
  )
    ? null
    : refusal;
}

/** The event to show next to one issue: a refusal is left out once the live view shows the issue past it. */
export function issueEvent(
  latest: ReadonlyMap<number, RuntimeEvent>,
  issueNumber: number,
  live?: LiveView,
): RuntimeEvent | undefined {
  const e = latest.get(issueNumber);
  if (!e || !outdated(e, live)) return e;
  return live!.stages.get(issueNumber) === 'refused' ? e : undefined;
}

/** Events of the last 24 hours from the broker; an empty list where the broker does not offer them yet. */
export async function fetchEvents(
  baseUrl: string,
  token: string,
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<RuntimeEvent[]> {
  const url = new URL('/v1/events', baseUrl);
  url.searchParams.set('since', new Date(now.getTime() - 86400000).toISOString());
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const parsed = z
    .object({ events: z.array(runtimeEventSchema) })
    .safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.events : [];
}
