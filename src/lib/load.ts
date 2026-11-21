import { fetchAnalytics, type AnalyticsView } from './analytics';
import { demoAnalytics, demoMetrics, demoQueue } from './demo';
import { demoMode, env } from './env';
import { fetchEvents } from './events';
import { fetchMetrics, type MetricsView } from './metrics';
import { fetchQueue, type QueueView } from './queue';

export type Loaded = { view: QueueView; error: null } | { view: null; error: string };
/** The current queue, or the fixed code of why it could not be read. */
export async function loadQueue(): Promise<Loaded> {
  if (demoMode()) return { view: demoQueue(), error: null };
  try {
    const [view, events] = await Promise.all([
      fetchQueue(env().FACTORY_RUNTIME_URL, env().FACTORY_MONITOR_TOKEN),
      fetchEvents(env().FACTORY_RUNTIME_URL, env().FACTORY_MONITOR_TOKEN, new Date()),
    ]);
    return { view: { ...view, events }, error: null };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RUNTIME_FAILED';
    return { view: null, error: code };
  }
}

export type LoadedAnalytics = { view: AnalyticsView; error: null } | { view: null; error: string };
/** The cost analytics of a period, or the fixed code of why they could not be read. */
export async function loadAnalytics(query: {
  days: number;
  repository: string | null;
}): Promise<LoadedAnalytics> {
  if (demoMode()) return { view: demoAnalytics(), error: null };
  try {
    return {
      view: await fetchAnalytics(env().FACTORY_RUNTIME_URL, env().FACTORY_MONITOR_TOKEN, query),
      error: null,
    };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RUNTIME_FAILED';
    return { view: null, error: code };
  }
}

export type LoadedMetrics = { view: MetricsView; error: null } | { view: null; error: string };
/** The lead-time and flow metrics of a period, or the fixed code of why they could not be read. */
export async function loadMetrics(query: {
  days: number;
  repository: string | null;
}): Promise<LoadedMetrics> {
  if (demoMode()) return { view: demoMetrics(), error: null };
  try {
    return {
      view: await fetchMetrics(env().FACTORY_RUNTIME_URL, env().FACTORY_MONITOR_TOKEN, query),
      error: null,
    };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RUNTIME_FAILED';
    return { view: null, error: code };
  }
}
