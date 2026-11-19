# Agent notes

- Read-only dashboard: never add endpoints that change Factory state. Actions belong in the SF Manager.
- The only data sources are the broker's `GET /v1/queue` and `GET /v1/analytics` (cost page); do not call the GitHub
  API for queue or cost data (the App installation's request quota is shared with the Factory).
- UI text is German; code, comments and docs are English.
- `npm run check` and `npm run format:check` must pass.
