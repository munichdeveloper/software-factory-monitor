import { describe, expect, it, vi } from 'vitest';
import { analyticsQuery, fetchAnalytics, tokenText, usd, weekRows } from '../src/lib/analytics';
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
