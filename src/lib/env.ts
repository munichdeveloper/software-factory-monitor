import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  APP_URL: z.url(),
  FACTORY_RUNTIME_URL: z.url().default('http://runtime-broker:8095'),
  FACTORY_MONITOR_TOKEN: z.string().min(32),
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1),
  MONITOR_ALLOWED_GITHUB_IDS: z.string().regex(/^\d+(,\d+)*$/),
  /** Signs session cookies. Unset: a random key per process, so a restart signs everybody out. */
  MONITOR_SESSION_SECRET: z.string().min(32).optional(),
});
export type Env = z.infer<typeof schema>;
let cached: Env | undefined;
let generated: string | undefined;
export function env(): Env {
  return (cached ??= schema.parse(process.env));
}
export function sessionSecret(): string {
  return env().MONITOR_SESSION_SECRET ?? (generated ??= randomBytes(32).toString('base64url'));
}
export function allowedUser(id: number): boolean {
  return env().MONITOR_ALLOWED_GITHUB_IDS.split(',').includes(String(id));
}
/**
 * Demo mode serves sample data without a login, for local development and screenshots only. It is refused in
 * production builds whatever the variable says.
 */
export function demoMode(): boolean {
  return process.env.MONITOR_DEMO === '1' && process.env.NODE_ENV !== 'production';
}
