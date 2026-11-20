'use client';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Loaded } from '@/lib/load';
import {
  groupOf,
  groups,
  nextReconcile,
  summary,
  type Group,
  type QueueEntry,
  type QueueRepository,
  type QueueView,
} from '@/lib/queue';
import { errorLabels, groupLabels, phaseLabels, reasonLabels, stageLabels } from '@/lib/labels';
import { clock, relative } from '@/lib/time';

const refreshSeconds = 30;
const priorityLabels = { high: 'Hoch', normal: 'Normal', low: 'Niedrig' } as const;

function stageText(entry: QueueEntry) {
  if (entry.stage === 'queued' && entry.waitsForSlot) return 'Wartet auf freien Slot';
  return stageLabels[entry.stage] ?? entry.stage;
}
function repoLink(repository: string, issue: number) {
  return `https://github.com/${repository}/issues/${issue}`;
}
function prNumber(url: string) {
  return `#${url.split('/').pop()}`;
}

function Slots({ slots }: { slots: QueueRepository['slots'] }) {
  if (!slots) return <span className="muted">Slots unbekannt</span>;
  return (
    <span className="slots" title={`${slots.active} von ${slots.max} Worker-Slots belegt`}>
      {Array.from({ length: Math.max(slots.max, slots.active) }, (_, i) => (
        <span key={i} className={i < slots.active ? 'slot used' : 'slot'} />
      ))}
      <span className="muted">
        {slots.active}/{slots.max} Slots
      </span>
    </span>
  );
}

function Entry({
  entry,
  repository,
  position,
  now,
}: {
  entry: QueueEntry;
  repository: string;
  position: number | null;
  now: number;
}) {
  const group = groupOf(entry.stage);
  const details: ReactNode[] = [];
  if (entry.run?.phase) details.push(`Phase: ${phaseLabels[entry.run.phase] ?? entry.run.phase}`);
  if (entry.reason) details.push(reasonLabels[entry.reason] ?? entry.reason);
  if (entry.retryAt) details.push(`Nächster Startversuch spätestens ${clock(entry.retryAt)}`);
  if (entry.dependsOn.length)
    details.push(
      <span key="deps">
        Hängt ab von{' '}
        {entry.dependsOn.map((n, i) => (
          <span key={n}>
            {i > 0 && ', '}
            <a href={repoLink(repository, n)} target="_blank" rel="noreferrer">
              #{n}
            </a>
          </span>
        ))}
      </span>,
    );
  if (entry.pullRequests.length)
    details.push(
      <span key="prs">
        PR{' '}
        {entry.pullRequests.map((url, i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} target="_blank" rel="noreferrer">
              {prNumber(url)}
            </a>
          </span>
        ))}
      </span>,
    );
  return (
    <li className={`entry ${group ?? ''}`}>
      <span className="position">{position ?? ''}</span>
      <div className="issue">
        <a href={entry.url} target="_blank" rel="noreferrer">
          <span className="number">#{entry.issueNumber}</span> {entry.title}
        </a>
        {details.length > 0 && (
          <div className="details">
            {details.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        )}
      </div>
      <span className={`badge ${group ?? ''}`}>{stageText(entry)}</span>
      <span className="meta">
        {entry.priority && entry.priority !== 'normal' && (
          <span className={`priority ${entry.priority}`}>{priorityLabels[entry.priority]}</span>
        )}
        <span title={clock(entry.since)}>{relative(entry.since, now)}</span>
        <span className="muted" title="Versuche (verbraucht / erlaubt)">
          Versuch {entry.attempts.used}/{entry.attempts.max}
        </span>
      </span>
    </li>
  );
}

function Repository({
  repository,
  filter,
  view,
  now,
}: {
  repository: QueueRepository;
  filter: Group | null;
  view: QueueView;
  now: number;
}) {
  const entries = repository.entries.filter((e) => !filter || groupOf(e.stage) === filter);
  // Positions count only what still waits to be started, in the broker's order.
  let waiting = 0;
  const next = nextReconcile(view, repository, now);
  return (
    <section className="repository">
      <header>
        <h2>
          <a
            href={`https://github.com/${repository.repository}/issues`}
            target="_blank"
            rel="noreferrer"
          >
            {repository.repository}
          </a>
        </h2>
        <Slots slots={repository.slots} />
        <span
          className="muted"
          title={repository.observedAt ? clock(repository.observedAt) : undefined}
        >
          {repository.observedAt
            ? `Abgleich ${relative(repository.observedAt, now)}${next ? `, ${next}` : ''}`
            : 'Noch kein Abgleich seit dem Start der Laufzeit'}
        </span>
      </header>
      {repository.failure && (
        <p className="alert">
          Letzter Abgleich {relative(repository.failure.at, now)} fehlgeschlagen:{' '}
          {reasonLabels[repository.failure.reason] ?? repository.failure.reason}. Angezeigt wird der
          Stand davor.
        </p>
      )}
      {entries.length ? (
        <ol className="entries">
          {entries.map((entry) => (
            <Entry
              key={entry.issueNumber}
              entry={entry}
              repository={repository.repository}
              position={groupOf(entry.stage) === 'waiting' ? ++waiting : null}
              now={now}
            />
          ))}
        </ol>
      ) : (
        <p className="empty">{filter ? 'Nichts in dieser Gruppe.' : 'Keine offenen Aufgaben.'}</p>
      )}
    </section>
  );
}

export function QueueBoard({ initial, login }: { initial: Loaded; login: string }) {
  const [loaded, setLoaded] = useState(initial);
  const [view, setView] = useState(initial.view);
  const [now, setNow] = useState(() => Date.parse(initial.view?.generatedAt ?? '') || 0);
  const [filter, setFilter] = useState<Group | null>(null);
  const [repo, setRepo] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/queue', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const next = (await response.json()) as Loaded;
      setLoaded(next);
      // A failed refresh keeps the last view on screen, marked with the error.
      if (next.view) setView(next.view);
    } catch {
      setLoaded({ view: null, error: 'RUNTIME_UNREACHABLE' });
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, []);
  useEffect(() => {
    setNow(Date.now());
    const poll = setInterval(() => void refresh(), refreshSeconds * 1000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const counts = useMemo(() => (view ? summary(view) : null), [view]);
  const repositories = (view?.repositories ?? []).filter((r) => !repo || r.repository === repo);

  return (
    <main className="board">
      <header className="top">
        <div>
          <h1>Factory-Queue</h1>
          <p className="muted">
            {view ? `Stand ${relative(view.generatedAt, now)} · ` : ''}aktualisiert sich alle{' '}
            {refreshSeconds} s
          </p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Lädt …' : 'Aktualisieren'}
          </button>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="ghost" title={`Angemeldet als ${login}`}>
              Abmelden
            </button>
          </form>
        </div>
      </header>
      {loaded.error && <p className="alert">{errorLabels[loaded.error] ?? loaded.error}</p>}
      {counts && (
        <nav className="summary" aria-label="Filter">
          {(Object.keys(groups) as Group[]).map((group) => (
            <button
              type="button"
              key={group}
              className={`tile ${group}${filter === group ? ' selected' : ''}`}
              aria-pressed={filter === group}
              onClick={() => setFilter(filter === group ? null : group)}
            >
              <span className="count">{counts[group]}</span>
              <span>{groupLabels[group]}</span>
            </button>
          ))}
        </nav>
      )}
      {view && view.repositories.length > 1 && (
        <label className="repo-filter">
          Repository{' '}
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            <option value="">Alle</option>
            {view.repositories.map((r) => (
              <option key={r.repositoryId} value={r.repository}>
                {r.repository}
              </option>
            ))}
          </select>
        </label>
      )}
      {view && !view.repositories.length && (
        <p className="empty">Die Laufzeit bedient noch kein Repository.</p>
      )}
      {repositories.map((repository) => (
        <Repository
          key={repository.repositoryId}
          repository={repository}
          filter={filter}
          view={view!}
          now={now}
        />
      ))}
    </main>
  );
}
