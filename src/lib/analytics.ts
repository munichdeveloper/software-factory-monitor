import { z } from 'zod';

/** The broker's cost analytics (software-factory, GET /v1/analytics). Unknown steps and selections are kept. */
const tokensSchema = z
  .object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number() })
  .nullable();
const callSchema = z.object({
  step: z.string(),
  prNumber: z.number().int().nullable(),
  executionId: z.string().nullable(),
  selection: z.string(),
  routerChoice: z.string().nullable(),
  routerProbability: z.number().nullable(),
  agent: z.string(),
  model: z.string(),
  effort: z.string().nullable(),
  tokens: tokensSchema,
  costUsd: z.number().nullable(),
  outcome: z.string().nullable(),
  at: z.string(),
  lost: z.boolean(),
});
const featureSchema = z.object({
  repository: z.string(),
  issueNumber: z.number().int(),
  title: z.string().nullable(),
  url: z.url(),
  state: z.enum(['merged', 'open', 'closed']),
  prNumber: z.number().int().nullable(),
  mergedAt: z.string().nullable(),
  mergedBy: z.enum(['factory', 'human']).nullable(),
  costUsd: z.number(),
  costInRange: z.number(),
  unknownCostCalls: z.number().int(),
  steps: z.record(z.string(), z.number()),
  codingRuns: z.number().int(),
  failedCodingRuns: z.number().int(),
  lastActivity: z.string(),
  calls: z.array(callSchema),
});
const modelSchema = z.object({
  step: z.string(),
  agent: z.string(),
  model: z.string(),
  effort: z.string().nullable(),
  selection: z.string(),
  calls: z.number().int(),
  costUsd: z.number(),
  unknownCostCalls: z.number().int(),
  failed: z.number().int(),
});
export const analyticsViewSchema = z.object({
  generatedAt: z.string(),
  from: z.string(),
  to: z.string(),
  repository: z.string().nullable(),
  repositories: z.array(z.string()),
  totals: z.object({
    costUsd: z.number(),
    calls: z.number().int(),
    unknownCostCalls: z.number().int(),
    lostCostUsd: z.number(),
    mergedFeatures: z.number().int(),
    costPerMergedFeature: z.object({ mean: z.number().nullable(), median: z.number().nullable() }),
  }),
  steps: z.array(z.object({ step: z.string(), costUsd: z.number(), calls: z.number().int() })),
  weekly: z.array(z.object({ week: z.string(), step: z.string(), costUsd: z.number() })),
  models: z.array(modelSchema),
  features: z.array(featureSchema),
});
export type AnalyticsView = z.infer<typeof analyticsViewSchema>;
export type AnalyticsFeature = z.infer<typeof featureSchema>;
export type AnalyticsCall = z.infer<typeof callSchema>;

export const periods = [7, 30, 90] as const;
/** Query of the analytics page: a period of 7, 30 or 90 days and an optional owner/name. */
export function analyticsQuery(params: {
  days?: string | string[];
  repository?: string | string[];
}) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const days = Number(first(params.days));
  const repository = first(params.repository) ?? '';
  return {
    days: (periods as readonly number[]).includes(days) ? days : 30,
    repository: /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository)
      ? repository
      : null,
  };
}

/** Reads the analytics from the broker; same transport rules and fixed codes as the queue. */
export async function fetchAnalytics(
  baseUrl: string,
  token: string,
  query: { days: number; repository: string | null },
  fetcher: typeof fetch = fetch,
): Promise<AnalyticsView> {
  const url = new URL('/v1/analytics', baseUrl);
  if (
    url.protocol !== 'https:' &&
    url.hostname !== 'runtime-broker' &&
    url.hostname !== '127.0.0.1'
  )
    throw new Error('RUNTIME_URL_INSECURE');
  url.searchParams.set('days', String(query.days));
  if (query.repository) url.searchParams.set('repository', query.repository);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('RUNTIME_UNREACHABLE');
  }
  if (response.status === 401) throw new Error('RUNTIME_UNAUTHORIZED');
  if (response.status === 404) throw new Error('RUNTIME_ANALYTICS_UNSUPPORTED');
  if (!response.ok) throw new Error('RUNTIME_FAILED');
  const parsed = analyticsViewSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('RUNTIME_INVALID_RESPONSE');
  return parsed.data;
}

export const stepLabels: Record<string, string> = {
  coding: 'Coding',
  review: 'Merge-Review',
  risk: 'Risikobewertung',
  planner: 'Planung',
};
export const stepOrder = ['coding', 'review', 'risk', 'planner'];
export const selectionLabels: Record<string, string> = {
  router: 'Router (Jev)',
  configured: 'Konfiguration',
  escalation: 'Eskalation',
};
export const stateLabels: Record<AnalyticsFeature['state'], string> = {
  merged: 'Gemergt',
  open: 'Offen',
  closed: 'Geschlossen ohne Merge',
};
const usdFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' });
export function usd(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : usdFormat.format(value);
}
export function tokenText(tokens: AnalyticsCall['tokens']): string {
  if (!tokens) return 'Tokens unbekannt';
  const k = (n: number) =>
    n >= 1e6
      ? `${(n / 1e6).toFixed(1)} Mio.`
      : n >= 1e3
        ? `${Math.round(n / 1e3)} Tsd.`
        : String(n);
  return `${k(tokens.input + tokens.cacheRead + tokens.cacheWrite)} ein (${k(tokens.cacheRead)} Cache) · ${k(tokens.output)} aus`;
}
/** Week rows for the stacked chart: one per week, the cost of each step and the week's total. */
export function weekRows(view: AnalyticsView) {
  const weeks = new Map<string, Record<string, number>>();
  for (const w of view.weekly) {
    const row = weeks.get(w.week) ?? {};
    row[w.step] = (row[w.step] ?? 0) + w.costUsd;
    weeks.set(w.week, row);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, steps]) => ({
      week,
      steps,
      total: Object.values(steps).reduce((s, v) => s + v, 0),
    }));
}
