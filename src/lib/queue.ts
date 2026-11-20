import { relative } from './time';
import { z } from 'zod';
import { runtimeEventSchema } from './events';

/** The broker's queue view (software-factory, GET /v1/queue). Unknown stages are kept, not rejected. */
export const stages = [
  'starting',
  'running',
  'awaiting-approval',
  'retry',
  'queued',
  'awaiting-grant',
  'refused',
  'blocked',
  'awaiting-pr',
  'failed',
  'closed',
] as const;
export type Stage = (typeof stages)[number];

/** One coding attempt (broker 0.18+); older brokers send none. */
const runSchema = z.object({
  executionId: z.string(),
  kind: z.string(),
  startedAt: z.string(),
  phase: z.string().nullable(),
  active: z.boolean(),
  outcome: z.string().nullable(),
  validation: z.string().nullable(),
  error: z.string().nullable(),
  infrastructure: z.boolean(),
  model: z.string().nullable(),
});
/** Where the broker's merge pass last left the task's pull request. */
const mergeSchema = z.object({
  pullRequest: z.number().int(),
  step: z.string(),
  detail: z.string().nullable(),
  risk: z.string().nullable(),
  at: z.string(),
});
const entrySchema = z.object({
  issueNumber: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  stage: z.string(),
  status: z.string(),
  priority: z.enum(['high', 'normal', 'low']).nullable(),
  attempts: z.object({ used: z.number().int(), max: z.number().int() }),
  since: z.string(),
  run: z
    .object({ executionId: z.string(), phase: z.string().nullable(), startedAt: z.string() })
    .nullable(),
  reason: z.string().nullable(),
  retryAt: z.string().nullable(),
  waitsForSlot: z.boolean(),
  dependsOn: z.array(z.number().int()),
  pullRequests: z.array(z.url()),
  runs: z.array(runSchema).default([]),
  merge: mergeSchema.nullable().default(null),
  mergedAt: z.string().nullable().default(null),
});
const repositorySchema = z.object({
  repositoryId: z.number().int(),
  repository: z.string(),
  observedAt: z.string().nullable(),
  outcome: z.string().nullable(),
  failure: z.object({ reason: z.string(), at: z.string() }).nullable(),
  slots: z.object({ active: z.number().int(), max: z.number().int() }).nullable(),
  entries: z.array(entrySchema),
});
export const queueViewSchema = z.object({
  generatedAt: z.string(),
  reconcileIntervalSeconds: z.number().int().nullable(),
  // From software-factory#198 on: when the broker's next pass starts, or since when one runs. Older brokers leave them out.
  passStartedAt: z.string().nullable().optional(),
  nextPassAt: z.string().nullable().optional(),
  repositories: z.array(repositorySchema),
  /** Runtime events of the last 24 hours (GET /v1/events), added by the monitor; not part of the broker's queue. */
  events: z.array(runtimeEventSchema).default([]),
});
export type QueueEntry = z.infer<typeof entrySchema>;
export type QueueRun = z.infer<typeof runSchema>;
export type MergeProgress = z.infer<typeof mergeSchema>;
export type QueueRepository = z.infer<typeof repositorySchema>;
export type QueueView = z.infer<typeof queueViewSchema>;

/** Groups for the summary: what a person looks at first. */
export const groups = {
  active: ['starting', 'running'],
  waiting: ['retry', 'queued'],
  person: ['awaiting-approval', 'awaiting-grant', 'awaiting-pr'],
  stuck: ['refused', 'blocked', 'failed'],
  done: ['closed'],
} as const satisfies Record<string, readonly Stage[]>;
export type Group = keyof typeof groups;

export function groupOf(stage: string): Group | null {
  for (const [group, members] of Object.entries(groups) as [Group, readonly string[]][])
    if (members.includes(stage)) return group;
  return null;
}
export function summary(view: QueueView): Record<Group, number> {
  const counts: Record<Group, number> = { active: 0, waiting: 0, person: 0, stuck: 0, done: 0 };
  for (const repository of view.repositories)
    for (const entry of repository.entries) {
      const group = groupOf(entry.stage);
      if (group) counts[group]++;
    }
  return counts;
}

/**
 * Reads the queue from the broker. Plain HTTP only to the broker's service name on the internal network; anything
 * else must be HTTPS. Fixed error codes only, never the broker's or the network's text.
 */
export async function fetchQueue(
  baseUrl: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<QueueView> {
  const url = new URL('/v1/queue', baseUrl);
  if (
    url.protocol !== 'https:' &&
    url.hostname !== 'runtime-broker' &&
    url.hostname !== '127.0.0.1'
  )
    throw new Error('RUNTIME_URL_INSECURE');
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('RUNTIME_UNREACHABLE');
  }
  if (response.status === 401) throw new Error('RUNTIME_UNAUTHORIZED');
  if (response.status === 404) throw new Error('RUNTIME_QUEUE_UNSUPPORTED');
  if (!response.ok) throw new Error('RUNTIME_FAILED');
  const parsed = queueViewSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('RUNTIME_INVALID_RESPONSE');
  return parsed.data;
}

/**
 * What the header says about the next reconciliation (software-factory#197). The broker reconciles the repositories one
 * after another and starts the next pass an interval after the last one ended, so `observedAt + interval` of a single
 * repository was too early ("Abgleich vor 4 Min., nächster vor 1 Min."). Webhooks reconcile in between.
 */
export function nextReconcile(
  view: QueueView,
  repository: QueueRepository,
  now: number,
): string | null {
  if (view.passStartedAt) return 'Durchlauf läuft';
  if (view.nextPassAt !== undefined) {
    if (!view.nextPassAt) return null;
    return Date.parse(view.nextPassAt) > now
      ? `nächster Durchlauf ${relative(view.nextPassAt, now)}`
      : 'nächster Durchlauf gleich';
  }
  // A broker before software-factory#198: at least never claim a past time.
  if (!repository.observedAt || !view.reconcileIntervalSeconds) return null;
  const next = Date.parse(repository.observedAt) + view.reconcileIntervalSeconds * 1000;
  return next > now ? `nächster frühestens ${relative(new Date(next).toISOString(), now)}` : null;
}
