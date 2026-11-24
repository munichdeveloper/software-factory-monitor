import Link from 'next/link';
import type { LoadedAnalytics } from '@/lib/load';
import {
  periods,
  selectionLabels,
  stateLabels,
  stepLabels,
  stepOrder,
  tokenText,
  usd,
  weekRows,
  evalsFor,
  shortModel,
  verdictClass,
  verdictLabels,
  wasteLabels,
  costEvalSummary,
  shadowAgreement,
  type CostEval,
  type AnalyticsFeature,
  type AnalyticsView,
} from '@/lib/analytics';
import { errorLabels } from '@/lib/labels';
import { clock } from '@/lib/time';

type Query = { days: number; repository: string | null };
function href(query: Query, change: Partial<Query>) {
  const next = { ...query, ...change };
  const params = new URLSearchParams({ days: String(next.days) });
  if (next.repository) params.set('repository', next.repository);
  return `/analytics?${params.toString()}`;
}
const stepClass = (step: string) => `step-${stepOrder.includes(step) ? step : 'other'}`;
const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)} %` : '–';
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(iso));

function Kpis({ view }: { view: AnalyticsView }) {
  const t = view.totals;
  return (
    <section className="kpis" aria-label="Kennzahlen">
      <div className="kpi">
        <span className="value">{usd(t.costUsd)}</span>
        <span className="label">Kosten im Zeitraum</span>
        <span className="muted">
          {t.calls} Modellaufrufe
          {t.unknownCostCalls ? `, ${t.unknownCostCalls} ohne Preis` : ''}
        </span>
      </div>
      <div className="kpi">
        <span className="value">{usd(t.costPerMergedFeature.median)}</span>
        <span className="label">pro gemergtem Feature (Median)</span>
        <span className="muted">Durchschnitt {usd(t.costPerMergedFeature.mean)}</span>
      </div>
      <div className="kpi">
        <span className="value">{t.mergedFeatures}</span>
        <span className="label">Features gemergt</span>
        <span className="muted">alle Versuche eingerechnet</span>
      </div>
      <div className="kpi lost">
        <span className="value">{usd(t.lostCostUsd)}</span>
        <span className="label">ohne Ergebnis</span>
        <span className="muted">{percent(t.lostCostUsd, t.costUsd)} der Kosten</span>
      </div>
    </section>
  );
}

function Legend({ steps }: { steps: string[] }) {
  return (
    <ul className="legend">
      {steps.map((step) => (
        <li key={step}>
          <span className={`swatch ${stepClass(step)}`} />
          {stepLabels[step] ?? step}
        </li>
      ))}
    </ul>
  );
}

function Steps({ view }: { view: AnalyticsView }) {
  const weeks = weekRows(view);
  const max = Math.max(...weeks.map((w) => w.total), 0);
  const present = stepOrder
    .filter((s) => view.steps.some((r) => r.step === s))
    .concat(view.steps.map((r) => r.step).filter((s) => !stepOrder.includes(s)));
  return (
    <section className="panel">
      <header>
        <h2>Kosten je Schritt</h2>
        <Legend steps={present} />
      </header>
      <table className="step-totals">
        <tbody>
          {present.map((step) => {
            const row = view.steps.find((r) => r.step === step)!;
            return (
              <tr key={step}>
                <th scope="row">
                  <span className={`swatch ${stepClass(step)}`} />
                  {stepLabels[step] ?? step}
                </th>
                <td className="num">{usd(row.costUsd)}</td>
                <td className="num muted">{percent(row.costUsd, view.totals.costUsd)}</td>
                <td className="num muted">{row.calls} Aufrufe</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {weeks.length > 0 && (
        <div className="weeks" role="img" aria-label="Kosten je Woche, nach Schritt gestapelt">
          {weeks.map((w) => (
            <div className="week" key={w.week}>
              <span className="week-label">ab {shortDate(w.week)}</span>
              <span className="bar" style={{ width: `${max ? (w.total / max) * 100 : 0}%` }}>
                {present.map((step) =>
                  w.steps[step] ? (
                    <span
                      key={step}
                      className={`segment ${stepClass(step)}`}
                      style={{ flexGrow: w.steps[step] }}
                      title={`${stepLabels[step] ?? step}: ${usd(w.steps[step])}`}
                    />
                  ) : null,
                )}
              </span>
              <span className="num">{usd(w.total)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Models({ view }: { view: AnalyticsView }) {
  const rows = [...view.models].sort(
    (a, b) => stepOrder.indexOf(a.step) - stepOrder.indexOf(b.step) || b.costUsd - a.costUsd,
  );
  return (
    <section className="panel">
      <header>
        <h2>Modelle</h2>
        <span className="muted">wer die Arbeit gemacht hat und wer das Modell gewählt hat</span>
      </header>
      <div className="scroll">
        <table className="models">
          <thead>
            <tr>
              <th>Schritt</th>
              <th>Modell</th>
              <th>Gewählt von</th>
              <th className="num">Aufrufe</th>
              <th className="num">Fehlgeschlagen</th>
              <th className="num">Kosten</th>
              <th className="num">je Aufruf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={[m.step, m.agent, m.model, m.effort, m.selection].join('|')}>
                <td>{stepLabels[m.step] ?? m.step}</td>
                <td>
                  <code>{m.model}</code>
                  <span className="muted">
                    {' '}
                    {m.effort ?? ''} · {m.agent}
                  </span>
                </td>
                <td>
                  <span className={`chip ${m.selection}`}>
                    {selectionLabels[m.selection] ?? m.selection}
                  </span>
                </td>
                <td className="num">{m.calls}</td>
                <td className="num">{m.failed || '–'}</td>
                <td className="num">
                  {usd(m.costUsd)}
                  {m.unknownCostCalls ? (
                    <span className="muted"> + {m.unknownCostCalls} ohne Preis</span>
                  ) : null}
                </td>
                <td className="num muted">
                  {m.calls > m.unknownCostCalls
                    ? usd(m.costUsd / (m.calls - m.unknownCostCalls))
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const count = (n: number | null | undefined) => (n === null || n === undefined ? '–' : String(n));
function verdictText(e: CostEval) {
  if (e.error || !e.judgement) return 'nicht bewertet';
  return verdictLabels[e.judgement.verdict] ?? e.judgement.verdict;
}

function Evaluation({ main, shadow }: { main?: CostEval; shadow?: CostEval }) {
  if (!main) return null;
  const j = main.error ? null : main.judgement;
  const m = main.metrics;
  return (
    <div className="eval">
      <details>
        <summary>
          <span className={`badge ${j ? verdictClass(j.verdict) : ''}`}>{verdictText(main)}</span>
          {shadow && (
            <span className="muted eval-shadow">
              {shortModel(shadow.evalModel)}: {verdictText(shadow)}
            </span>
          )}
        </summary>
        <div className="eval-body">
          {j ? (
            <>
              <p>
                Kosten {usd(main.costUsd)} · angemessen wären {usd(j.fairCostUsd)}
              </p>
              <p>{j.reason}</p>
              {j.waste.length > 0 && (
                <ul>
                  {j.waste.map((w, i) => (
                    <li key={`${w.category}-${i}`}>
                      {wasteLabels[w.category] ?? w.category}: {usd(w.usd)}
                      <span className="muted"> {w.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="muted">{main.error ?? 'Keine Bewertung vorhanden.'}</p>
          )}
          <dl className="eval-metrics">
            <dt>Doppelt gelesen</dt>
            <dd>{count(m.duplicateReads)}</dd>
            <dt>Gelesen außerhalb des Diffs</dt>
            <dd>{count(m.readsOutsideDiff)}</dd>
            <dt>Test-/Build-Aufrufe</dt>
            <dd>{count(m.testOrBuildCommands)}</dd>
            <dt>Fehlgeschlagene Werkzeuge</dt>
            <dd>{count(m.failedTools)}</dd>
            <dt>Fixkontext (Tokens)</dt>
            <dd>{count(m.fixedContextTokens)}</dd>
            <dt>Geänderte Zeilen</dt>
            <dd>{count(m.changedLines)}</dd>
          </dl>
          {m.traceMissing && <p className="muted">ohne Werkzeugspur bewertet</p>}
        </div>
      </details>
    </div>
  );
}

function Feature({ feature, view }: { feature: AnalyticsFeature; view: AnalyticsView }) {
  const present = stepOrder.filter((s) => feature.steps[s]);
  return (
    <li className="feature">
      <details>
        <summary>
          <span className="feature-title">
            <a href={feature.url} target="_blank" rel="noreferrer">
              <span className="number">#{feature.issueNumber}</span> {feature.title ?? 'Issue'}
            </a>
            <span className="muted">
              {' '}
              {feature.repository.split('/')[1]}
              {feature.prNumber ? ` · PR #${feature.prNumber}` : ''}
              {feature.mergedAt ? ` · gemergt ${clock(feature.mergedAt)}` : ''}
              {feature.mergedBy === 'human' ? ' (von Hand)' : ''}
            </span>
          </span>
          <span className={`badge ${feature.state}`}>{stateLabels[feature.state]}</span>
          <span className="feature-cost num">{usd(feature.costUsd)}</span>
          <span className="feature-steps">
            <span className="bar">
              {present.map((step) => (
                <span
                  key={step}
                  className={`segment ${stepClass(step)}`}
                  style={{ flexGrow: feature.steps[step] }}
                  title={`${stepLabels[step]}: ${usd(feature.steps[step])}`}
                />
              ))}
            </span>
            <span className="muted">
              {feature.codingRuns} Coding-Läufe
              {feature.failedCodingRuns ? `, ${feature.failedCodingRuns} ohne Erfolg` : ''}
            </span>
          </span>
        </summary>
        <div className="scroll">
          <table className="calls">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Schritt</th>
                <th>Modell</th>
                <th>Gewählt von</th>
                <th>Verbrauch</th>
                <th>Ergebnis</th>
                <th>Bewertung</th>
                <th className="num">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {feature.calls.map((c, i) => (
                <tr key={`${c.at}-${i}`} className={c.lost ? 'lost' : undefined}>
                  <td>{clock(c.at)}</td>
                  <td>
                    {stepLabels[c.step] ?? c.step}
                    {c.prNumber ? <span className="muted"> PR #{c.prNumber}</span> : null}
                  </td>
                  <td>
                    <code>{c.model}</code> <span className="muted">{c.effort ?? ''}</span>
                  </td>
                  <td>
                    {selectionLabels[c.selection] ?? c.selection}
                    {c.routerChoice ? (
                      <span className="muted">
                        {' '}
                        ({c.selection === 'router' ? '' : 'Jev wollte '}
                        {c.routerChoice}
                        {c.routerProbability !== null
                          ? `, ${Math.round(c.routerProbability * 100)} %`
                          : ''}
                        )
                      </span>
                    ) : null}
                  </td>
                  <td className="muted">{tokenText(c.tokens)}</td>
                  <td>{c.outcome === 'success' ? 'Erfolg' : (c.outcome ?? 'kein Ergebnis')}</td>
                  <td>
                    {c.step === 'coding' && <Evaluation {...evalsFor(view, c.executionId)} />}
                  </td>
                  <td className="num">{usd(c.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}

function CostEvalPanel({ view }: { view: AnalyticsView }) {
  const summary = costEvalSummary(view);
  const calibration = shadowAgreement(view);
  const report = view.costReport;
  const maxWaste = Math.max(...summary.waste.map((w) => w.usd), 0);
  return (
    <section className="panel cost-eval">
      <header>
        <h2>Kosten-Eval</h2>
        <span className="muted">Bewertung jedes Coding-Laufs durch das Hauptmodell</span>
      </header>
      {summary.runs === 0 ? (
        <p className="empty">Noch keine bewerteten Läufe in diesem Zeitraum.</p>
      ) : (
        <>
          <div className="eval-kpis">
            <div>
              <span className="value">{summary.runs}</span>
              <span className="muted">bewertete Läufe</span>
            </div>
            <div>
              <span className="value">{usd(summary.costUsd)}</span>
              <span className="muted">ausgegeben</span>
            </div>
            <div>
              <span className="value">{usd(summary.fairCostUsd)}</span>
              <span className="muted">angemessen wären</span>
            </div>
          </div>
          <ul className="verdicts" aria-label="Urteile">
            {summary.verdicts.map((v) => (
              <li key={v.verdict}>
                <span className={`badge ${verdictClass(v.verdict)}`}>
                  {verdictLabels[v.verdict] ?? v.verdict}
                </span>{' '}
                {v.runs}
              </li>
            ))}
          </ul>
          {summary.waste.length > 0 && (
            <>
              <h3>Häufigste Verschwendung</h3>
              <div className="weeks waste" role="img" aria-label="Vermeidbare Kosten je Kategorie">
                {summary.waste.map((w) => (
                  <div className="week" key={w.category}>
                    <span className="week-label">{wasteLabels[w.category] ?? w.category}</span>
                    <span
                      className="bar"
                      style={{ width: `${maxWaste ? (w.usd / maxWaste) * 100 : 0}%` }}
                    >
                      <span className="segment step-coding" style={{ flexGrow: 1 }} />
                    </span>
                    <span className="num">{usd(w.usd)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {report?.report && (
        <>
          <h3>Wochenbericht ab {shortDate(report.week)}</h3>
          <p>{report.report.summary}</p>
          {report.report.patterns.length > 0 && (
            <ul className="patterns">
              {report.report.patterns.map((p, i) => (
                <li key={`${p.category}-${i}`}>
                  <strong>{wasteLabels[p.category] ?? p.category}</strong>{' '}
                  <span className="num">{usd(p.usd)}</span>
                  <span className="muted"> in {p.runs} Läufen</span>
                  <div className="muted">{p.evidence}</div>
                  <div>{p.proposal}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {report?.error && <p className="alert">Wochenbericht fehlgeschlagen</p>}
      {calibration.length > 0 && (
        <>
          <h3>Kalibrierung</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Hauptmodell</th>
                  <th>Schattenmodell</th>
                  <th className="num">Übereinstimmung</th>
                  <th className="num">Paare</th>
                  <th className="num">⌀ angemessen</th>
                </tr>
              </thead>
              <tbody>
                {calibration.map((c) => (
                  <tr key={`${c.mainModel}|${c.shadowModel}`}>
                    <td>{shortModel(c.mainModel)}</td>
                    <td>{shortModel(c.shadowModel)}</td>
                    <td className="num">{Math.round(c.agreement * 100)} %</td>
                    <td className="num">{c.pairs}</td>
                    <td className="num">
                      {usd(c.mainFairUsd)} / {usd(c.shadowFairUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function AnalyticsBoard({
  loaded,
  query,
  login,
}: {
  loaded: LoadedAnalytics;
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
            <span aria-current="page">Kosten</span>
            <Link href="/metrics">Metriken</Link>
          </nav>
          <h1>Factory-Kosten</h1>
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
          <Kpis view={view} />
          {view.totals.calls === 0 ? (
            <p className="empty">Keine Modellaufrufe in diesem Zeitraum.</p>
          ) : (
            <div className="panels">
              <Steps view={view} />
              <Models view={view} />
            </div>
          )}
          {view.costEvals && <CostEvalPanel view={view} />}
          <section className="panel">
            <header>
              <h2>Features</h2>
              <span className="muted">
                Kosten je Issue über alle Versuche; aufklappen zeigt jeden Modellaufruf
              </span>
            </header>
            {view.features.length ? (
              <ol className="features">
                {view.features.map((f) => (
                  <Feature key={`${f.repository}#${f.issueNumber}`} feature={f} view={view} />
                ))}
              </ol>
            ) : (
              <p className="empty">Keine Features in diesem Zeitraum.</p>
            )}
          </section>
          <p className="muted footnote">
            Gezählt werden Inferenzkosten zu Listenpreisen: Coding-Läufe (vom Agenten gemeldet) und
            die Modellaufrufe des Brokers (Merge-Review, Risikobewertung, Planung). Jev-Anfragen und
            Actions-Minuten sind nicht enthalten. „Ohne Ergebnis“: Coding-Läufe ohne Erfolg und alle
            Kosten von Issues, die ohne Merge geschlossen wurden.
          </p>
        </>
      )}
    </main>
  );
}
