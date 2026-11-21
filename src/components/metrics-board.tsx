import Link from 'next/link';
import { periods, usd } from '@/lib/analytics';
import { errorLabels } from '@/lib/labels';
import type { LoadedMetrics } from '@/lib/load';
import { duration, share, type Distribution, type MetricsView } from '@/lib/metrics';
import { clock } from '@/lib/time';

type Query = { days: number; repository: string | null };
function href(query: Query, change: Partial<Query>) {
  const next = { ...query, ...change };
  const params = new URLSearchParams({ days: String(next.days) });
  if (next.repository) params.set('repository', next.repository);
  return `/metrics?${params.toString()}`;
}
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(iso));
const runs = (n: number) => (n === 1 ? '1 Lauf' : `${n} Läufe`);
const spread = (d: Distribution) =>
  d.count ? `Median ${duration(d.medianMs)} · P90 ${duration(d.p90Ms)}` : 'noch keine Daten';
const number = (value: number | null) =>
  value === null ? '–' : value.toLocaleString('de-DE', { maximumFractionDigits: 2 });

function LeadTimes({ view }: { view: MetricsView }) {
  const { factory, human } = view.leadTime;
  return (
    <section className="kpis" aria-label="Durchlaufzeiten">
      <div className="kpi">
        <span className="value">{duration(factory.meanMs)}</span>
        <span className="label">Durchlaufzeit bis Auto-Merge (Ø)</span>
        <span className="muted">
          {runs(factory.count)} · {spread(factory)}
        </span>
      </div>
      <div className="kpi">
        <span className="value">{duration(human.meanMs)}</span>
        <span className="label">Durchlaufzeit mit menschlichem Merge (Ø)</span>
        <span className="muted">
          {runs(human.count)} · {spread(human)}
        </span>
      </div>
      <div className="kpi person">
        <span className="value">{duration(human.wait.meanMs)}</span>
        <span className="label">davon Wartezeit auf den Menschen (Ø)</span>
        <span className="muted">
          Übergabe bis Merge · {human.wait.count ? spread(human.wait) : 'noch keine Daten'}
        </span>
      </div>
      <div className="kpi">
        <span className="value">{share(view.flow.automationRate)}</span>
        <span className="label">Automatisierungsquote</span>
        <span className="muted">
          {view.flow.mergedByFactory} von {view.flow.merged} Merges durch die Factory
        </span>
      </div>
    </section>
  );
}

function Flow({ view }: { view: MetricsView }) {
  const f = view.flow;
  return (
    <section className="kpis" aria-label="Weitere Kennzahlen">
      <div className="kpi">
        <span className="value">{share(f.firstPassYield)}</span>
        <span className="label">Im ersten Versuch gelungen</span>
        <span className="muted">
          ein Coding-Lauf, kein Fehlversuch · Ø {number(f.codingRunsPerMerge)} Läufe je Merge
        </span>
      </div>
      <div className="kpi">
        <span className="value">{duration(f.pickup.medianMs)}</span>
        <span className="label">Aufnahme bis Coding-Start (Median)</span>
        <span className="muted">Ø {duration(f.pickup.meanMs)} · Warteschlange und Freigabe</span>
      </div>
      <div className="kpi">
        <span className="value">{duration(f.codingRun.medianMs)}</span>
        <span className="label">Dauer eines Coding-Laufs (Median)</span>
        <span className="muted">
          P90 {duration(f.codingRun.p90Ms)} · {share(f.codingShare)} der Durchlaufzeit ist Coding
        </span>
      </div>
      <div className="kpi lost">
        <span className="value">
          {share(f.codingRuns ? f.failedCodingRuns / f.codingRuns : null)}
        </span>
        <span className="label">Coding-Läufe ohne Erfolg</span>
        <span className="muted">
          {f.failedCodingRuns} von {f.codingRuns} · {f.closedWithoutMerge} Issues ohne Merge
          geschlossen
        </span>
      </div>
    </section>
  );
}

function Weeks({ view }: { view: MetricsView }) {
  const max = Math.max(...view.weekly.map((w) => w.merged), 0);
  return (
    <section className="panel">
      <header>
        <h2>Je Woche</h2>
        <ul className="legend">
          <li>
            <span className="swatch merge-factory" />
            Auto-Merge
          </li>
          <li>
            <span className="swatch merge-human" />
            Menschlicher Merge
          </li>
        </ul>
      </header>
      <div
        className="weeks metric-weeks"
        role="img"
        aria-label="Merges je Woche und Median der Durchlaufzeit"
      >
        {view.weekly.map((w) => (
          <div className="week" key={w.week}>
            <span className="week-label">ab {shortDate(w.week)}</span>
            <span className="bar" style={{ width: `${max ? (w.merged / max) * 100 : 0}%` }}>
              {w.mergedByFactory ? (
                <span
                  className="segment merge-factory"
                  style={{ flexGrow: w.mergedByFactory }}
                  title={`Auto-Merge: ${w.mergedByFactory}`}
                />
              ) : null}
              {w.merged - w.mergedByFactory ? (
                <span
                  className="segment merge-human"
                  style={{ flexGrow: w.merged - w.mergedByFactory }}
                  title={`Menschlicher Merge: ${w.merged - w.mergedByFactory}`}
                />
              ) : null}
            </span>
            <span className="num">{w.merged === 1 ? '1 Merge' : `${w.merged} Merges`}</span>
            <span className="num muted">{duration(w.leadMedianMs)}</span>
          </div>
        ))}
      </div>
      <p className="muted footnote">Rechts: Median der Durchlaufzeit bis Auto-Merge.</p>
    </section>
  );
}

function Repositories({ view }: { view: MetricsView }) {
  return (
    <section className="panel">
      <header>
        <h2>Je Repository</h2>
      </header>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th className="num">Merges</th>
              <th className="num">Automatisiert</th>
              <th className="num">Durchlaufzeit (Median)</th>
              <th className="num">Erster Versuch</th>
              <th className="num">Kosten je Merge</th>
            </tr>
          </thead>
          <tbody>
            {view.repositoryRows.map((r) => (
              <tr key={r.repository}>
                <td>{r.repository.split('/')[1]}</td>
                <td className="num">{r.merged}</td>
                <td className="num">{share(r.merged ? r.mergedByFactory / r.merged : null)}</td>
                <td className="num">{duration(r.leadMedianMs)}</td>
                <td className="num">{share(r.firstPassYield)}</td>
                <td className="num">{usd(r.costPerMergedUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Items({ view }: { view: MetricsView }) {
  return (
    <section className="panel">
      <header>
        <h2>Gemessene Läufe</h2>
        <span className="muted">bis zum Merge durchgelaufene Issues, neueste zuerst</span>
      </header>
      {view.items.length ? (
        <div className="scroll">
          <table className="metric-items">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Merge</th>
                <th>Aufnahme</th>
                <th>Gemergt</th>
                <th className="num">Durchlaufzeit</th>
                <th className="num">Wartezeit</th>
                <th className="num">Coding-Läufe</th>
                <th className="num">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((i) => (
                <tr key={`${i.repository}#${i.issueNumber}`}>
                  <td>
                    <a href={i.url} target="_blank" rel="noreferrer">
                      <span className="number">#{i.issueNumber}</span> {i.title ?? 'Issue'}
                    </a>
                    <span className="muted">
                      {' '}
                      {i.repository.split('/')[1]}
                      {i.prNumber ? ` · PR #${i.prNumber}` : ''}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${i.mergedBy === 'factory' ? 'router' : 'escalation'}`}>
                      {i.mergedBy === 'factory' ? 'Auto-Merge' : 'Mensch'}
                    </span>
                  </td>
                  <td className="muted">{i.qualifiedAt ? clock(i.qualifiedAt) : 'unbekannt'}</td>
                  <td className="muted">{clock(i.mergedAt)}</td>
                  <td className="num">{duration(i.leadMs)}</td>
                  <td className="num">{i.mergedBy === 'human' ? duration(i.waitMs) : ''}</td>
                  <td className="num">
                    {i.codingRuns}
                    {i.failedCodingRuns ? (
                      <span className="muted"> ({i.failedCodingRuns} ohne Erfolg)</span>
                    ) : null}
                  </td>
                  <td className="num">{usd(i.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Keine gemergten Läufe in diesem Zeitraum.</p>
      )}
    </section>
  );
}

export function MetricsBoard({
  loaded,
  query,
  login,
}: {
  loaded: LoadedMetrics;
  query: Query;
  login: string;
}) {
  const view = loaded.view;
  return (
    <main className="board">
      <header className="top">
        <div>
          <nav className="tabs" aria-label="Ansicht">
            <Link href="/">Queue</Link>
            <Link href="/analytics">Kosten</Link>
            <span aria-current="page">Metriken</span>
          </nav>
          <h1>Factory-Metriken</h1>
          <p className="muted">
            {view
              ? `${shortDate(view.from)} bis ${shortDate(view.to)} · Stand ${clock(view.generatedAt)}`
              : ''}
          </p>
        </div>
        <div className="actions">
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="ghost" title={`Angemeldet als ${login}`}>
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <nav className="filters" aria-label="Filter">
        <span className="segmented">
          {periods.map((days) => (
            <Link
              key={days}
              href={href(query, { days })}
              aria-current={query.days === days ? 'page' : undefined}
            >
              {days} Tage
            </Link>
          ))}
        </span>
        {view && view.repositories.length > 1 && (
          <span className="segmented">
            <Link
              href={href(query, { repository: null })}
              aria-current={!query.repository ? 'page' : undefined}
            >
              Alle
            </Link>
            {view.repositories.map((r) => (
              <Link
                key={r}
                href={href(query, { repository: r })}
                aria-current={query.repository === r ? 'page' : undefined}
              >
                {r.split('/')[1]}
              </Link>
            ))}
          </span>
        )}
      </nav>
      {loaded.error && <p className="alert">{errorLabels[loaded.error] ?? loaded.error}</p>}
      {view && (
        <>
          <LeadTimes view={view} />
          <Flow view={view} />
          {view.weekly.length > 0 && (
            <div className="panels">
              <Weeks view={view} />
              <Repositories view={view} />
            </div>
          )}
          <Items view={view} />
          <p className="muted footnote">
            Durchlaufzeit: von der Aufnahme in die Factory (harness:managed gesetzt und, wo
            harness:ready eine menschliche Freigabe ist, auch harness:ready) bis zum Merge des PRs.
            Gemessen werden nur Läufe, die bis zum Merge durchliefen: „Auto-Merge“, wenn die Factory
            selbst gemergt hat, „Mensch“, wenn der Merge-Schritt den PR an einen Menschen übergeben
            hat (Risiko über der Schwelle oder Freigabe nötig); Wartezeit ist dann die Zeit von der
            Übergabe bis zum Merge. Läufe ohne Merge werden nicht gemessen.
            {view.leadTime.unknownIntake
              ? ` ${view.leadTime.unknownIntake} Merges ohne bekannten Aufnahmezeitpunkt (vor Beginn der Messung aufgenommen).`
              : ''}
          </p>
        </>
      )}
    </main>
  );
}
