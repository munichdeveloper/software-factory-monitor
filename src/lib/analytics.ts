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
const metricNumber = z.number().nullish();
const metricsSchema = z.object({
  costUsd: metricNumber,
  requests: metricNumber,
  turns: metricNumber,
  durationMinutes: metricNumber,
  fixedContextTokens: metricNumber,
  reads: metricNumber,
  duplicateReads: metricNumber,
  readsOutsideDiff: metricNumber,
  edits: metricNumber,
  testOrBuildCommands: metricNumber,
  failedTools: metricNumber,
  documentationReads: metricNumber,
  changedFiles: metricNumber,
  changedLines: metricNumber,
  costPerChangedLine: metricNumber,
  traceTruncated: z.boolean().nullish(),
  traceMissing: z.boolean().nullish(),
});
/** Verdicts and waste categories are plain strings: unknown ones are shown raw, never dropped. */
const judgementSchema = z
  .object({
    verdict: z.string(),
    fairCostUsd: z.number(),
    waste: z.array(z.object({ category: z.string(), usd: z.number(), note: z.string() })),
    reason: z.string(),
  })
  .nullable();
const costEvalSchema = z.object({
  repository: z.string(),
  issueNumber: z.number().int(),
  executionId: z.string(),
  model: z.string(),
  effort: z.string(),
  costUsd: z.number().nullable(),
  outcome: z.string().nullable(),
  metrics: metricsSchema,
  judgement: judgementSchema,
  evalModel: z.string(),
  shadow: z.boolean(),
  error: z.string().nullable(),
  at: z.string(),
});
const costReportSchema = z
  .object({
    week: z.string(),
    model: z.string(),
    error: z.string().nullable(),
    at: z.string(),
    report: z
      .object({
        summary: z.string(),
        patterns: z.array(
          z.object({
            category: z.string(),
            usd: z.number(),
            runs: z.number(),
            evidence: z.string(),
            proposal: z.string(),
          }),
        ),
      })
      .nullable(),
  })
  .nullable();
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
  costEvals: z.array(costEvalSchema).optional(),
  costReport: costReportSchema.optional(),
});
export type AnalyticsView = z.infer<typeof analyticsViewSchema>;
export type AnalyticsFeature = z.infer<typeof featureSchema>;
export type AnalyticsCall = z.infer<typeof callSchema>;
export type CostEval = z.infer<typeof costEvalSchema>;

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
  reconcile: 'Bestandsaufnahme',
  'cost-eval': 'Kosten-Eval',
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

export const verdictLabels: Record<string, string> = {
  appropriate: 'angemessen',
  expensive: 'teuer',
  wasteful: 'verschwenderisch',
};
/** Badge colour class of a verdict; unknown verdicts stay neutral. */
export const verdictClass = (verdict: string) =>
  ({ appropriate: 'active', expensive: 'person', wasteful: 'stuck' })[verdict] ?? '';
export const wasteLabels: Record<string, string> = {
  'unnecessary-reads': 'Unnötige Leserunden',
  'repeated-tests': 'Wiederholte Tests/Builds',
  'model-too-strong': 'Zu starkes Modell',
  'restart-after-deterministic-failure': 'Neustart nach deterministischem Fehler',
  'documentation-reading': 'Doku-Lesen',
  'dead-end': 'Sackgasse',
  'fixed-context': 'Fixkosten Kontext',
};
/** "claude-haiku-5-5" -> "Haiku"; unknown names are returned as they are. */
export function shortModel(model: string): string {
  const m = /(opus|sonnet|haiku|fable)/i.exec(model);
  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase() : model;
}
/** The main (non-shadow) evaluation and the shadow evaluation of one coding run, matched by executionId. */
export function evalsFor(view: Pick<AnalyticsView, 'costEvals'>, executionId: string | null) {
  const rows = executionId
    ? (view.costEvals ?? []).filter((e) => e.executionId === executionId)
    : [];
  return { main: rows.find((e) => !e.shadow), shadow: rows.find((e) => e.shadow) };
}

/** Main (non-shadow) evaluations with a judgement, within the page's repository filter. */
function judged(view: Pick<AnalyticsView, 'costEvals' | 'repository'>) {
  return (view.costEvals ?? []).filter(
    (e) => !e.shadow && e.judgement && (!view.repository || e.repository === view.repository),
  );
}
export interface CostEvalSummary {
  runs: number;
  verdicts: { verdict: string; runs: number }[];
  costUsd: number;
  fairCostUsd: number;
  waste: { category: string; usd: number }[];
}
/** Totals of the main model's verdicts: runs per verdict, spent vs. fair cost, avoidable dollars per waste category. */
export function costEvalSummary(
  view: Pick<AnalyticsView, 'costEvals' | 'repository'>,
): CostEvalSummary {
  const rows = judged(view);
  const verdicts = new Map<string, number>();
  const waste = new Map<string, number>();
  let costUsd = 0;
  let fairCostUsd = 0;
  for (const e of rows) {
    const j = e.judgement!;
    verdicts.set(j.verdict, (verdicts.get(j.verdict) ?? 0) + 1);
    costUsd += e.costUsd ?? 0;
    fairCostUsd += j.fairCostUsd;
    for (const w of j.waste) waste.set(w.category, (waste.get(w.category) ?? 0) + w.usd);
  }
  const order = Object.keys(verdictLabels);
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  return {
    runs: rows.length,
    verdicts: [...verdicts.entries()]
      .map(([verdict, runs]) => ({ verdict, runs }))
      .sort((a, b) => rank(a.verdict) - rank(b.verdict) || a.verdict.localeCompare(b.verdict)),
    costUsd,
    fairCostUsd,
    waste: [...waste.entries()]
      .map(([category, usd]) => ({ category, usd }))
      .filter((w) => w.usd > 0)
      .sort((a, b) => b.usd - a.usd || a.category.localeCompare(b.category)),
  };
}
export interface ShadowAgreement {
  mainModel: string;
  shadowModel: string;
  pairs: number;
  agreement: number;
  mainFairUsd: number;
  shadowFairUsd: number;
}
/**
 * Calibration of the shadow model: per model pair, how often it gave the same verdict as the main model on the same run,
 * and the average fair cost each estimated. Only runs both judged count.
 */
export function shadowAgreement(
  view: Pick<AnalyticsView, 'costEvals' | 'repository'>,
): ShadowAgreement[] {
  const all = (view.costEvals ?? []).filter(
    (e) => e.judgement && (!view.repository || e.repository === view.repository),
  );
  const pairs = new Map<string, { same: number; n: number; main: number; shadow: number }>();
  for (const shadow of all.filter((e) => e.shadow)) {
    const main = all.find((e) => !e.shadow && e.executionId === shadow.executionId);
    if (!main) continue;
    const key = `${main.evalModel}\n${shadow.evalModel}`;
    const p = pairs.get(key) ?? { same: 0, n: 0, main: 0, shadow: 0 };
    p.n += 1;
    if (main.judgement!.verdict === shadow.judgement!.verdict) p.same += 1;
    p.main += main.judgement!.fairCostUsd;
    p.shadow += shadow.judgement!.fairCostUsd;
    pairs.set(key, p);
  }
  return [...pairs.entries()].map(([key, p]) => {
    const [mainModel, shadowModel] = key.split('\n') as [string, string];
    return {
      mainModel,
      shadowModel,
      pairs: p.n,
      agreement: p.same / p.n,
      mainFairUsd: p.main / p.n,
      shadowFairUsd: p.shadow / p.n,
    };
  });
}
