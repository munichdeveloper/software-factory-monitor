import { describe, expect, it, vi } from 'vitest';
import {
  analyticsQuery,
  analyticsViewSchema,
  costEvalSummary,
  shadowAgreement,
  evalsFor,
  fetchAnalytics,
  shortModel,
  stepLabels,
  tokenText,
  usd,
  verdictLabels,
  wasteLabels,
  weekRows,
} from '../src/lib/analytics';
import { demoAnalytics } from '../src/lib/demo';

const token = 'q'.repeat(32);
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('analytics client', () => {
  it('reads and validates the view with the monitor token and the period', async () => {
    const view = demoAnalytics(new Date('2026-11-19T12:00:00Z'));
    const fetcher = reply(200, view);
    expect(
      await fetchAnalytics(
        'http://runtime-broker:8095',
        token,
        { days: 7, repository: 'owner/repo' },
        fetcher,
      ),
    ).toEqual(view);
    const [url, init] = (fetcher as unknown as { mock: { calls: [URL, RequestInit][] } }).mock
      .calls[0]!;
    expect(String(url)).toBe(
      'http://runtime-broker:8095/v1/analytics?days=7&repository=owner%2Frepo',
    );
    expect(init.headers).toEqual({ Authorization: `Bearer ${token}` });
  });
  it('maps failures to fixed codes', async () => {
    const q = { days: 30, repository: null };
    await expect(
      fetchAnalytics('http://runtime-broker:8095', token, q, reply(404, {})),
    ).rejects.toThrow('RUNTIME_ANALYTICS_UNSUPPORTED');
    await expect(
      fetchAnalytics('http://runtime-broker:8095', token, q, reply(200, {})),
    ).rejects.toThrow('RUNTIME_INVALID_RESPONSE');
    await expect(fetchAnalytics('http://example.com', token, q, reply(200, {}))).rejects.toThrow(
      'RUNTIME_URL_INSECURE',
    );
  });
  it('accepts only known periods and well-formed repositories', () => {
    expect(analyticsQuery({ days: '7', repository: 'owner/repo' })).toEqual({
      days: 7,
      repository: 'owner/repo',
    });
    expect(analyticsQuery({ days: '1000', repository: 'x y' })).toEqual({
      days: 30,
      repository: null,
    });
    expect(analyticsQuery({})).toEqual({ days: 30, repository: null });
  });
  it('formats money, tokens and week rows', () => {
    expect(usd(4.4)).toMatch(/4,40/);
    expect(usd(null)).toBe('–');
    expect(tokenText({ input: 2400, output: 41000, cacheRead: 1800000, cacheWrite: 90000 })).toBe(
      '1.9 Mio. ein (1.8 Mio. Cache) · 41 Tsd. aus',
    );
    const rows = weekRows(demoAnalytics());
    expect(rows.map((r) => r.week)).toEqual(['2026-11-09', '2026-11-16']);
    expect(rows[1]!.total).toBeCloseTo(12.87);
  });
});

describe('cost evaluations', () => {
  const view = demoAnalytics(new Date('2026-11-19T12:00:00Z'));
  it('accepts the view with and without the new fields', () => {
    expect(analyticsViewSchema.safeParse(view).success).toBe(true);
    const old: Partial<typeof view> = { ...view };
    delete old.costEvals;
    delete old.costReport;
    const parsed = analyticsViewSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    const withReport = analyticsViewSchema.parse({
      ...old,
      costReport: { week: '2026-11-16', model: 'm', error: 'x', at: 'now', report: null },
    });
    expect(withReport.costReport?.error).toBe('x');
  });
  it('keeps unknown verdicts and categories', () => {
    const e = structuredClone(view.costEvals![0]!);
    e.judgement = {
      verdict: 'mysterious',
      fairCostUsd: 1,
      waste: [{ category: 'new-thing', usd: 1, note: 'n' }],
      reason: 'r',
    };
    const parsed = analyticsViewSchema.parse({ ...view, costEvals: [e] });
    expect(parsed.costEvals![0]!.judgement?.verdict).toBe('mysterious');
    expect(parsed.costEvals![0]!.judgement?.waste[0]!.category).toBe('new-thing');
  });
  it('matches evaluations to runs by executionId', () => {
    const { main, shadow } = evalsFor(view, 'e'.repeat(32));
    expect(main?.judgement?.verdict).toBe('wasteful');
    expect(shadow?.shadow).toBe(true);
    expect(evalsFor(view, 'f'.repeat(32)).shadow).toBeUndefined();
    expect(evalsFor(view, null).main).toBeUndefined();
    expect(evalsFor({}, 'e'.repeat(32)).main).toBeUndefined();
    const verdicts = new Set(
      view.costEvals!.filter((e) => !e.shadow).map((e) => e.judgement?.verdict),
    );
    expect(verdicts).toEqual(new Set(['wasteful', 'expensive', 'appropriate']));
    expect(view.costEvals!.some((e) => e.metrics.traceMissing)).toBe(true);
  });
  it('has German labels', () => {
    expect(stepLabels['cost-eval']).toBe('Kosten-Eval');
    expect(verdictLabels.wasteful).toBe('verschwenderisch');
    expect(wasteLabels['dead-end']).toBe('Sackgasse');
    expect(shortModel('claude-haiku-5-5')).toBe('Haiku');
    expect(shortModel('gpt-6.1-sol')).toBe('gpt-6.1-sol');
  });
});

describe('cost evaluation overview', () => {
  const judgement = (
    verdict: string,
    fairCostUsd: number,
    waste: { category: string; usd: number }[] = [],
  ) => ({
    verdict,
    fairCostUsd,
    reason: 'x',
    waste: waste.map((w) => ({ ...w, note: 'n' })),
  });
  const row = (over: Record<string, unknown>) => ({
    repository: 'o/a',
    issueNumber: 1,
    executionId: 'a'.repeat(32),
    model: 'claude-opus-5-5',
    effort: 'high',
    costUsd: 2,
    outcome: 'success',
    metrics: {},
    judgement: judgement('appropriate', 2),
    evalModel: 'claude-sonnet-5-5',
    shadow: false,
    error: null,
    at: '2026-11-24T08:00:00Z',
    ...over,
  });
  const view = (rows: Record<string, unknown>[], repository: string | null = null) =>
    analyticsViewSchema
      .pick({ costEvals: true, repository: true })
      .parse({ costEvals: rows, repository });

  it('sums the main verdicts without shadow or failed rows and orders waste by dollars', () => {
    const rows = [
      row({
        judgement: judgement('wasteful', 0.5, [
          { category: 'unnecessary-reads', usd: 1 },
          { category: 'dead-end', usd: 0.3 },
        ]),
      }),
      row({
        executionId: 'b'.repeat(32),
        costUsd: 3,
        judgement: judgement('expensive', 2, [
          { category: 'dead-end', usd: 0.9 },
          { category: 'fixed-context', usd: 0 },
        ]),
      }),
      row({ executionId: 'c'.repeat(32), costUsd: null, judgement: judgement('appropriate', 1) }),
      row({
        shadow: true,
        evalModel: 'claude-haiku-5-5',
        judgement: judgement('wasteful', 9, [{ category: 'dead-end', usd: 9 }]),
      }),
      row({ executionId: 'd'.repeat(32), judgement: null, error: 'CLAUDE_HTTP_529' }),
      row({
        executionId: 'e'.repeat(32),
        repository: 'o/b',
        judgement: judgement('wasteful', 0, [{ category: 'dead-end', usd: 5 }]),
      }),
    ];
    const all = costEvalSummary(view(rows));
    expect(all.runs).toBe(4);
    expect(all.verdicts).toEqual([
      { verdict: 'appropriate', runs: 1 },
      { verdict: 'expensive', runs: 1 },
      { verdict: 'wasteful', runs: 2 },
    ]);
    expect(all.costUsd).toBe(7);
    expect(all.fairCostUsd).toBeCloseTo(3.5);
    expect(all.waste.map((w) => w.category)).toEqual(['dead-end', 'unnecessary-reads']);
    expect(all.waste[0]!.usd).toBeCloseTo(6.2);
    const one = costEvalSummary(view(rows, 'o/a'));
    expect(one.runs).toBe(3);
    expect(one.waste.map((w) => w.category)).toEqual(['dead-end', 'unnecessary-reads']);
    expect(one.waste[0]!.usd).toBeCloseTo(1.2);
    expect(costEvalSummary(view([])).runs).toBe(0);
  });

  it('measures how often the shadow model agrees with the main model on the same run', () => {
    const rows = [
      row({ judgement: judgement('wasteful', 1) }),
      row({ shadow: true, evalModel: 'claude-haiku-5-5', judgement: judgement('wasteful', 2) }),
      row({ executionId: 'b'.repeat(32), judgement: judgement('appropriate', 3) }),
      row({
        executionId: 'b'.repeat(32),
        shadow: true,
        evalModel: 'claude-haiku-5-5',
        judgement: judgement('expensive', 1),
      }),
      row({ executionId: 'c'.repeat(32), shadow: true, evalModel: 'claude-haiku-5-5' }),
      row({ executionId: 'd'.repeat(32), judgement: judgement('wasteful', 1) }),
      row({
        executionId: 'd'.repeat(32),
        shadow: true,
        evalModel: 'claude-haiku-5-5',
        judgement: null,
        error: 'x',
      }),
    ];
    expect(shadowAgreement(view(rows))).toEqual([
      {
        mainModel: 'claude-sonnet-5-5',
        shadowModel: 'claude-haiku-5-5',
        pairs: 2,
        agreement: 0.5,
        mainFairUsd: 2,
        shadowFairUsd: 1.5,
      },
    ]);
    expect(shadowAgreement(view(rows, 'o/other'))).toEqual([]);
  });

  it('shows the overview with a weekly report and a calibration in the demo data', () => {
    const demo = demoAnalytics(new Date('2026-11-24T12:00:00Z'));
    expect(costEvalSummary(demo).runs).toBeGreaterThan(0);
    expect(shadowAgreement(demo)).toHaveLength(1);
    expect(demo.costReport?.report?.patterns.length).toBeGreaterThan(0);
  });
});
