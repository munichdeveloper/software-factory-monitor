import { demoQueue } from './demo';
import { demoMode, env } from './env';
import { fetchQueue, type QueueView } from './queue';

export type Loaded = { view: QueueView; error: null } | { view: null; error: string };
/** The current queue, or the fixed code of why it could not be read. */
export async function loadQueue(): Promise<Loaded> {
  if (demoMode()) return { view: demoQueue(), error: null };
  try {
    return {
      view: await fetchQueue(env().FACTORY_RUNTIME_URL, env().FACTORY_MONITOR_TOKEN),
      error: null,
    };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RUNTIME_FAILED';
    return { view: null, error: code };
  }
}
