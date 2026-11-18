/** German labels of the dashboard. */
export const stageLabels: Record<string, string> = {
  starting: 'Wird gestartet',
  running: 'Läuft',
  'awaiting-approval': 'Wartet auf Freigabe im Manager',
  retry: 'Wiederholung geplant',
  queued: 'In Warteschlange',
  'awaiting-grant': 'Wartet auf harness:ready',
  refused: 'Start abgelehnt',
  blocked: 'Blockiert',
  'awaiting-pr': 'PR wartet auf Review',
  failed: 'Fehlgeschlagen',
  closed: 'Geschlossen',
};
export const groupLabels = {
  active: 'Läuft',
  waiting: 'In Warteschlange',
  person: 'Wartet auf dich',
  stuck: 'Blockiert / fehlgeschlagen',
} as const;
export const phaseLabels: Record<string, string> = {
  starting: 'startet',
  'awaiting-approval': 'wartet auf Freigabe',
  authorizing: 'autorisiert',
  running: 'arbeitet',
  publishing: 'veröffentlicht',
  completed: 'abgeschlossen',
  cancelled: 'abgebrochen',
};
/** Fixed codes the broker reports, explained. Unknown codes are shown as they are. */
export const reasonLabels: Record<string, string> = {
  GITHUB_HTTP_403: 'GitHub verweigert (meist Rate-Limit der App-Installation erschöpft)',
  GITHUB_HTTP_404: 'GitHub: nicht gefunden',
  GITHUB_HTTP_502: 'GitHub vorübergehend nicht erreichbar',
  OPERATION_FAILED: 'Abgleich fehlgeschlagen',
  TEMPORAL_NOT_ENABLED: 'Repository nutzt nicht die Temporal-Laufzeit',
  READY_APPROVAL_REQUIRED: 'harness:ready muss von einer berechtigten Person gesetzt werden',
  EXECUTOR_WRAPPER_RELEASE_MISMATCH:
    'Wrapper-Release passt nicht zur Laufzeit (Rollout über den SF Manager nötig)',
  EXECUTOR_INFRASTRUCTURE_FAILURE: 'Runner oder Workspace konnte nicht vorbereitet werden',
  RETAINED_RELEASE_EXPIRED: 'Lauf auf altem Release nach Ablauf beendet',
  CHECK_FAILED: 'Unabhängige Validierung: Checks fehlgeschlagen',
  NO_PUBLISHABLE_CHANGES: 'Worker hat keine Änderungen erzeugt',
  VALIDATION_SETUP_FAILED: 'Validierungsumgebung konnte nicht aufgesetzt werden',
  QUEUE_VIEW_FAILED: 'Queue-Ansicht konnte nicht berechnet werden',
};
export const errorLabels: Record<string, string> = {
  RUNTIME_UNREACHABLE: 'Die Factory-Laufzeit ist nicht erreichbar.',
  RUNTIME_UNAUTHORIZED: 'Die Laufzeit lehnt das Monitor-Token ab (FACTORY_MONITOR_TOKEN prüfen).',
  RUNTIME_QUEUE_UNSUPPORTED: 'Die laufende Factory-Version bietet die Queue-Ansicht noch nicht an.',
  RUNTIME_INVALID_RESPONSE: 'Die Laufzeit hat eine unerwartete Antwort geliefert.',
  RUNTIME_URL_INSECURE:
    'FACTORY_RUNTIME_URL muss HTTPS sein (außer runtime-broker im internen Netz).',
  RUNTIME_FAILED: 'Die Laufzeit hat mit einem Fehler geantwortet.',
};
