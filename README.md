# Software Factory Monitor

A read-only dashboard of the Software Factory's job queue: every open managed task of every repository the
Factory runtime serves, where it stands (running, queued, waiting for a free worker slot, waiting for
`harness:ready` or an approval, retry planned, refused, blocked, pull request waiting for review, failed), since
when, with attempts, priority, dependencies and pull requests, plus each repository's worker slots and its last
reconciliation. The page refreshes every 30 seconds. UI language: German.

## Data source

The runtime broker (munichdeveloper/software-factory) keeps the queue of each repository after every
reconciliation and serves it at `GET /v1/queue` (see its `docs/temporal-runtime.md`). The view is built from what
the reconciliation already read, so the dashboard costs **no GitHub requests** besides the login. The monitor
reads it over the internal network `sf-runtime-api` with `FACTORY_MONITOR_TOKEN`, a read-only credential that
opens this view and nothing else.

## Access

Sign-in with GitHub (an OAuth App of its own, callback `https://MONITOR_HOST/api/auth/callback`). Only the GitHub
user IDs in `MONITOR_ALLOWED_GITHUB_IDS` get a session. Sessions are signed cookies (12 hours) with
`MONITOR_SESSION_SECRET`; nothing is stored on the server and the GitHub token is discarded after the login.

## Configuration

| Variable                                               | Content                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `APP_URL`                                              | Public URL, e.g. `https://queue.example.com` (compose: `https://${MONITOR_HOST}`)                   |
| `FACTORY_RUNTIME_URL`                                  | Broker URL, default `http://runtime-broker:8095`; plain HTTP only to that internal name             |
| `FACTORY_MONITOR_TOKEN`                                | Same value as the broker's `FACTORY_MONITOR_TOKEN` (software-factory secret `BROKER_MONITOR_TOKEN`) |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | The OAuth App                                                                                       |
| `MONITOR_ALLOWED_GITHUB_IDS`                           | Comma-separated GitHub user IDs                                                                     |
| `MONITOR_SESSION_SECRET`                               | At least 32 characters; unset, every restart signs everybody out                                    |

## Deployment

`operations/compose.yaml` runs the app next to the Factory runtime on the runtime host, behind Traefik
(`sfm_front`) and on `sf-runtime-api`. The Factory installed deploy-only in this repository deploys it after CI
passed on `main` (docker-ssh, compose file `operations/compose.yaml`, project `sf-monitor`). Secrets come from
the GitHub environment `production` of this repository: the configuration declares them in `deploy.secrets`
(Factory 0.12.0), the SF Manager renders them into the wrapper's `deploy-env`, and each deployment writes them to
`.sf-deploy.env`. `MONITOR_HOST` defaults to `sf-monitor.srv2127002.hstgr.cloud` in the compose file, so the host needs no `.env`.

```yaml
deploy:
  enabled: true
  trigger: checks
  workflows: ['CI']
  path: /home/deploy/sf-monitor
  composeFile: operations/compose.yaml
  project: sf-monitor
  envFile: null # MONITOR_HOST defaults to sf-monitor.srv2127002.hstgr.cloud in the compose file
  secrets:
    FACTORY_MONITOR_TOKEN: MONITOR_FACTORY_TOKEN
    GITHUB_OAUTH_CLIENT_ID: MONITOR_OAUTH_CLIENT_ID
    GITHUB_OAUTH_CLIENT_SECRET: MONITOR_OAUTH_CLIENT_SECRET
    MONITOR_ALLOWED_GITHUB_IDS: MONITOR_ALLOWED_GITHUB_IDS
    MONITOR_SESSION_SECRET: MONITOR_SESSION_SECRET
```

## Development

`npm ci`, then `MONITOR_DEMO=1 npm run dev` shows sample data without a login (refused in production builds).
`npm run check` runs type check, lint and tests; `npm run build` builds the standalone server.
