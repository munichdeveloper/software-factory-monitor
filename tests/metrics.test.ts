import { describe, expect, it, vi } from 'vitest';
import { demoMetrics } from '../src/lib/demo';
import { duration, fetchMetrics, share } from '../src/lib/metrics';

const token = 'q'.repeat(32);
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('metrics client', () => {
  it('reads and validates the view with the monitor token and the period', async () => {
    const view = demoMetrics(new Date('2026-11-21T12:00:00Z'));
    const fetcher = reply(200, view);
    expect(
      await fetchMetrics(
        'http://runtime-broker:8095',
        token,
        { days: 7, repository: 'owner/repo' },
        fetcher,
      ),
    ).toEqual(view);
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe(
      'http://runtime-broker:8095/v1/metrics?days=7&repository=owner%2Frepo',
    );
    expect((init as RequestInit).headers).toEqual({ Authorization: `Bearer ${token}` });
  });
  it('accepts a broker without the router evaluation', async () => {
    const { router, ...older } = demoMetrics(new Date('2026-11-21T12:00:00Z'));
    expect(router?.cases.length).toBeGreaterThan(0);
    expect(
      (
        await fetchMetrics(
          'http://runtime-broker:8095',
          token,
          { days: 30, repository: null },
          reply(200, older),
        )
      ).router,
    ).toBeUndefined();
  });
  it('maps failures to fixed codes', async () => {
    const q = { days: 30, repository: null };
    await expect(fetchMetrics('http://example.com', token, q, reply(200, {}))).rejects.toThrow(
      'RUNTIME_URL_INSECURE',
    );
    await expect(fetchMetrics('https://b', token, q, reply(404, {}))).rejects.toThrow(
      'RUNTIME_METRICS_UNSUPPORTED',
    );
    await expect(fetchMetrics('https://b', token, q, reply(401, {}))).rejects.toThrow(
      'RUNTIME_UNAUTHORIZED',
    );
    await expect(fetchMetrics('https://b', token, q, reply(200, { items: [] }))).rejects.toThrow(
      'RUNTIME_INVALID_RESPONSE',
    );
  });
});

describe('metrics formatting', () => {
  it('writes durations and shares in German', () => {
    expect(duration(null)).toBe('–');
    expect(duration(20000)).toBe('< 1 Min.');
    expect(duration(45 * 60000)).toBe('45 Min.');
    expect(duration(3 * 3600000)).toBe('3 Std.');
    expect(duration(3 * 3600000 + 20 * 60000)).toBe('3 Std. 20 Min.');
    expect(duration(52 * 3600000)).toBe('2 T. 4 Std.');
    expect(share(0.667)).toBe('67 %');
    expect(share(null)).toBe('–');
  });
});
