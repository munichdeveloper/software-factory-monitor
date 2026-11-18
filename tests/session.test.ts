import { describe, expect, it } from 'vitest';
import { sign, verify } from '../src/lib/session';

const secret = 's'.repeat(32);
describe('session cookie', () => {
  it('round-trips a signed, unexpired session', () => {
    const session = { id: 731456, login: 'someone', exp: Date.now() + 60000 };
    expect(verify(sign(session, secret), secret)).toEqual(session);
  });
  it('rejects expired, tampered, foreign and malformed values', () => {
    const valid = sign({ id: 1, login: 'a', exp: Date.now() + 60000 }, secret);
    expect(verify(sign({ id: 1, login: 'a', exp: Date.now() - 1 }, secret), secret)).toBeNull();
    const [payload, signature] = valid.split('.');
    const forged = Buffer.from(
      JSON.stringify({ id: 2, login: 'b', exp: Date.now() + 60000 }),
    ).toString('base64url');
    expect(verify(`${forged}.${signature}`, secret)).toBeNull();
    expect(verify(`${payload}.${signature}x`, secret)).toBeNull();
    expect(verify(valid, 't'.repeat(32))).toBeNull();
    expect(verify(`${valid}.extra`, secret)).toBeNull();
    expect(verify(undefined, secret)).toBeNull();
    expect(verify('x'.repeat(2000), secret)).toBeNull();
  });
});
