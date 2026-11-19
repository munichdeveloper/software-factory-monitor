import { describe, expect, it, vi } from 'vitest';
import { demoQueue } from '../src/lib/demo';
import { fetchQueue, groupOf, summary } from '../src/lib/queue';
import { relative } from '../src/lib/time';

const token = 'q'.repeat(32);
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('broker client', () => {
  it('reads and validates the queue view with the monitor token', async () => {
    const view = demoQueue(new Date('2026-11-18T12:00:00Z'));
    const fetcher = reply(200, view);
    expect(await fetchQueue('http://runtime-broker:8095', token, fetcher)).toEqual(view);
    const [url, init] = (fetcher as unknown as { mock: { calls: [URL, RequestInit][] } }).mock
      .calls[0]!;
    expect(String(url)).toBe('http://runtime-broker:8095/v1/queue');
    expect(init.headers).toEqual({ Authorization: `Bearer ${token}` });
  });
  it('maps failures to fixed codes', async () => {
    await expect(fetchQueue('http://runtime-broker:8095', token, reply(401, {}))).rejects.toThrow(
      'RUNTIME_UNAUTHORIZED',
    );
    await expect(fetchQueue('http://runtime-broker:8095', token, reply(404, {}))).rejects.toThrow(
      'RUNTIME_QUEUE_UNSUPPORTED',
    );
    await expect(fetchQueue('http://runtime-broker:8095', token, reply(409, {}))).rejects.toThrow(
      'RUNTIME_FAILED',
    );
    await expect(
      fetchQueue('http://runtime-broker:8095', token, reply(200, { nope: 1 })),
    ).rejects.toThrow('RUNTIME_INVALID_RESPONSE');
    const down = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1');
    }) as unknown as typeof fetch;
    await expect(fetchQueue('http://runtime-broker:8095', token, down)).rejects.toThrow(
      'RUNTIME_UNREACHABLE',
    );
  });
  it('refuses plain HTTP to any host but the internal broker', async () => {
    await expect(fetchQueue('http://example.com', token, reply(200, {}))).rejects.toThrow(
      'RUNTIME_URL_INSECURE',
    );
  });
});

describe('summary', () => {
  it('counts entries per group and ignores unknown stages', () => {
    const view = demoQueue();
    view.repositories[0]!.entries.push({
      ...view.repositories[0]!.entries[0]!,
      issueNumber: 999,
      stage: 'something-new',
    });
    expect(summary(view)).toEqual({ active: 1, waiting: 2, person: 4, stuck: 2, done: 1 });
    expect(groupOf('something-new')).toBeNull();
  });
});

describe('relative time', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  it('speaks German', () => {
    expect(relative('2026-11-18T11:59:40Z', now)).toBe('gerade eben');
    expect(relative('2026-11-18T11:55:00Z', now)).toBe('vor 5 Min.');
    expect(relative('2026-11-18T09:00:00Z', now)).toBe('vor 3 Std.');
    expect(relative('2026-11-15T12:00:00Z', now)).toBe('vor 3 Tagen');
    expect(relative('2026-11-18T12:06:00Z', now)).toBe('in 6 Min.');
    expect(relative(null, now)).toBe('–');
  });
});
