import { createHmac, timingSafeEqual } from 'node:crypto';

export type Session = { id: number; login: string; exp: number };
export const sessionCookie = 'sfmon-session';
export const stateCookie = 'sfmon-oauth';
export const sessionHours = 12;

const mac = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

/** A session is the signed GitHub identity with an expiry; nothing is stored on the server. */
export function sign(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${mac(payload, secret)}`;
}
export function verify(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): Session | null {
  if (!value || value.length > 1000) return null;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(payload, secret)),
    given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (
      !Number.isSafeInteger(session.id) ||
      typeof session.login !== 'string' ||
      typeof session.exp !== 'number' ||
      session.exp <= now
    )
      return null;
    return session;
  } catch {
    return null;
  }
}
