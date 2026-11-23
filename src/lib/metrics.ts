import { z } from 'zod';

/** The broker's lead-time and flow metrics (software-factory, GET /v1/metrics). */
const ms = z.number().nullable();
const distributionSchema = z.object({
  count: z.number().int(),
  meanMs: ms,
  medianMs: ms,
  p90Ms: ms,
});
/** How a Factory issue ended (software-factory#239); absent from older brokers. */
export const outcomeClasses = [
  'automatic',
  'approved',
  'replacement',
  'human-merge',
  'abandoned',
] as const;
const outcomeSchema = z.enum(outcomeClasses);
const itemSchema = z.object({
  repository: z.string(),
  issueNumber: z.number().int(),
  title: z.string().nullable(),
  url: z.url(),
  prNumber: z.number().int().nullable(),
  mergedBy: z.enum(['factory', 'human']),
  qualifiedAt: z.string().nullable(),
  handoverAt: z.string().nullable(),
  mergedAt: z.string(),
  leadMs: ms,
  waitMs: ms,
  outcome: outcomeSchema.optional(),
  netLeadMs: ms.optional(),
  humanWaitMs: ms.optional(),
  pickupMs: ms,
  codingRuns: z.number().int(),
  failedCodingRuns: z.number().int(),
  codingMs: z.number(),
  reviews: z.number().int(),
  costUsd: z.number(),
});
const ratio = z.number().nullable();
const tier = z.enum(['cheap', 'mid', 'strong']);
const routerGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  routed: z.boolean(),
  tier,
  model: z.string().nullable(),
  effort: z.string().nullable(),
  issues: z.number().int(),
  settled: z.number().int(),
  merged: z.number().int(),
  firstPassYield: ratio,
  firstRunFailRate: ratio,
  reworkRate: ratio,
  escalationRate: ratio,
  reviews: z.number().int(),
  rejections: z.number().int(),
  rejectionRate: ratio,
  meanProbability: ratio,
  meanCostUsd: z.number().nullable(),
  costPerMergedUsd: z.number().nullable(),
  leadMedianMs: ms,
  firstRunMedianMs: ms,
  overkill: z.number().int(),
  underpowered: z.number().int(),
});
const routerCaseSchema = z.object({
  repository: z.string(),
  issueNumber: z.number().int(),
  title: z.string().nullable(),
  url: z.url(),
  choice: z.string().nullable(),
  routed: z.boolean(),
  probability: ratio,
  model: z.string(),
  effort: z.string().nullable(),
  tier,
  status: z.enum(['merged', 'closed', 'open']),
  firstRunOk: z.boolean(),
  codingRuns: z.number().int(),
  reworks: z.number().int(),
  retries: z.number().int(),
  escalations: z.number().int(),
  reviews: z.number().int(),
  rejections: z.number().int(),
  firstPass: z.boolean(),
  firstRunMs: ms,
  firstRunCostUsd: z.number().nullable(),
  costUsd: z.number(),
  leadMs: ms,
  startedAt: z.string(),
  flag: z.enum(['overkill', 'underpowered']).nullable(),
});
/** Jev's model choice against the outcome (broker router evaluation); absent from older brokers. */
const routerEvaluationSchema = z.object({
  issues: z.number().int(),
  routed: z.number().int(),
  routedShare: ratio,
  overkillThresholdMs: z.number(),
  overkill: z.number().int(),
  overkillCostUsd: z.number(),
  underpowered: z.number().int(),
  verdictsSince: z.string().nullable(),
  choices: z.array(routerGroupSchema),
  tiers: z.array(routerGroupSchema),
  confidence: z.array(
    z.object({
      bucket: z.string(),
      issues: z.number().int(),
      firstPassYield: ratio,
      troubleRate: ratio,
    }),
  ),
  cases: z.array(routerCaseSchema),
});
export const metricsViewSchema = z.object({
  generatedAt: z.string(),
  from: z.string(),
  to: z.string(),
  repository: z.string().nullable(),
  repositories: z.array(z.string()),
  leadTime: z.object({
    factory: distributionSchema,
    human: distributionSchema.extend({ wait: distributionSchema }),
    unknownIntake: z.number().int(),
    net: distributionSchema
      .extend({ byClass: z.record(z.string(), distributionSchema).optional() })
      .optional(),
    humanWait: distributionSchema
      .extend({ issuesWithWait: z.number().int().optional() })
      .optional(),
  }),
  flow: z.object({
    merged: z.number().int(),
    mergedByFactory: z.number().int(),
    mergedByHuman: z.number().int(),
    automationRate: ratio,
    firstPassYield: ratio,
    codingRunsPerMerge: ratio,
    failedCodingRuns: z.number().int(),
    codingRuns: z.number().int(),
    closedWithoutMerge: z.number().int(),
    pickup: distributionSchema,
    codingRun: distributionSchema,
    codingShare: ratio,
    reviewsPerMerge: ratio,
    outcomes: z
      .object({
        counts: z.object({
          automatic: z.number().int(),
          approved: z.number().int(),
          replacement: z.number().int(),
          'human-merge': z.number().int(),
          abandoned: z.number().int(),
        }),
        closed: z.number().int(),
        unclassified: z.number().int().optional(),
        automationRate: ratio,
      })
      .optional(),
  }),
  weekly: z.array(
    z.object({
      week: z.string(),
      merged: z.number().int(),
      mergedByFactory: z.number().int(),
      leadMedianMs: ms,
    }),
  ),
  repositoryRows: z.array(
    z.object({
      repository: z.string(),
      merged: z.number().int(),
      mergedByFactory: z.number().int(),
      leadMedianMs: ms,
      firstPassYield: ratio,
      costPerMergedUsd: z.number().nullable(),
    }),
  ),
  items: z.array(itemSchema),
  router: routerEvaluationSchema.optional(),
});
export type RouterEvaluation = z.infer<typeof routerEvaluationSchema>;
export type RouterGroup = z.infer<typeof routerGroupSchema>;
export type RouterCase = z.infer<typeof routerCaseSchema>;
export type MetricsView = z.infer<typeof metricsViewSchema>;
export type MetricsItem = z.infer<typeof itemSchema>;
export type Distribution = z.infer<typeof distributionSchema>;

/** Reads the metrics from the broker; same transport rules and fixed codes as the cost analytics. */
export async function fetchMetrics(
  baseUrl: string,
  token: string,
  query: { days: number; repository: string | null },
  fetcher: typeof fetch = fetch,
): Promise<MetricsView> {
  const url = new URL('/v1/metrics', baseUrl);
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
  if (response.status === 404) throw new Error('RUNTIME_METRICS_UNSUPPORTED');
  if (!response.ok) throw new Error('RUNTIME_FAILED');
  const parsed = metricsViewSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('RUNTIME_INVALID_RESPONSE');
  return parsed.data;
}

/** A duration in German: "45 Min.", "3 Std. 20 Min.", "2 T. 4 Std.". */
export function duration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '–';
  const minutes = Math.round(value / 60000);
  if (minutes < 1) return '< 1 Min.';
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
  const days = Math.floor(hours / 24),
    restHours = hours % 24;
  return restHours ? `${days} T. ${restHours} Std.` : `${days} T.`;
}
/** A share as "67 %". */
export function share(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : `${Math.round(value * 100)} %`;
}
