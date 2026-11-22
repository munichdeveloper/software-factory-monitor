# Software Factory Monitor

A read-only dashboard of the Software Factory's job queue: every open managed task of every repository the
Factory runtime serves, where it stands (running, queued, waiting for a free worker slot, waiting for
`harness:ready` or an approval, retry planned, refused, blocked, pull request waiting for review, failed), since
when, with attempts, priority, dependencies and pull requests, plus each repository's worker slots and its last
reconciliation. The page refreshes every 30 seconds. UI language: German.

The page **Kosten** (`/analytics`) shows what the Factory's model calls cost over 7, 30 or 90 days, per repository
or for all: cost per merged feature (median and mean, every attempt of an issue included), cost without a result,
cost per step (coding, merge review, risk assessment, planning) and per week, a table of models with who chose them
(model router Jev, configuration or escalation), and every feature (issue) with each of its model calls. Only
inference cost at list prices is counted; Jev's routing requests and Actions minutes are not.

## Data source

The runtime broker (munichdeveloper/software-factory) keeps the queue of each repository after every
reconciliation and serves it at `GET /v1/queue` (see its `docs/temporal-runtime.md`). The view is built from what
the reconciliation already read, so the dashboard costs **no GitHub requests** besides the login. The monitor
reads it over the internal network `sf-runtime-api` with `FACTORY_MONITOR_TOKEN`, a read-only credential that
opens this view and the cost analytics (`GET /v1/analytics`, broker since software-factory#170) and nothing
else.

## Access

Sign-in with GitHub (a GitHub App of its own, used for user sign-in only, callback `https://MONITOR_HOST/api/auth/callback`). Only the GitHub
user IDs in `MONITOR_ALLOWED_GITHUB_IDS` get a session. Sessions are signed cookies (12 hours) with
`MONITOR_SESSION_SECRET`; nothing is stored on the server and the GitHub token is discarded after the login.

## Approving pull requests

When the Factory hands a pull request over because its risk class is above `merge.risk.autoMergeUpTo`, the merge
step shows a button **Freigeben**. It posts the comment the Factory asks for, `/harness approve <id>`, on the pull
request, as the signed-in person:

1. The form post (same origin only) is checked against the broker's current queue: only an id the merge pass
   currently asks for, for that repository and pull request, is accepted.
2. The monitor sends the person to GitHub once more. The sign-in is a GitHub App (client id `Iv…`), which accepts
   only its registered callback, so login and approval share `/api/auth/callback`; the approval's own signed cookie
   tells them apart. GitHub returns without a prompt when the person already authorised the App.
3. The callback accepts only the same GitHub account that is signed in to the monitor, checks the queue again and
   posts the comment with that person's user access token. The token is used for this one comment and then discarded.

A GitHub App user token can comment only where the App may: the monitor's App needs the repository permission
**Pull requests: Read and write** and must be installed on every repository the Factory works in (or on all
repositories of the account). Without that GitHub refuses the comment and the page says so.

The Factory itself still decides: it counts the comment only from someone with write access to the repository and only
for the current head, review and risk (a new commit yields a new id).

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
(`sfm_front`) and on `sf-runtime-api`. The Factory installed deploy-only in this repository deploys it after the Test workflow
passed on `main` (docker-ssh, compose file `operations/compose.yaml`, project `sf-monitor`). Secrets come from
the GitHub environment `production` of this repository: the configuration declares them in `deploy.secrets`
(Factory 0.12.0), the SF Manager renders them into the wrapper's `deploy-env`, and each deployment writes them to
`.sf-deploy.env`. `MONITOR_HOST` defaults to `sf-monitor.srv2127002.hstgr.cloud` in the compose file, so the host needs no `.env`.

```yaml
deploy:
  enabled: true
  trigger: checks
  workflows: ['Test'] # the default the Factory's deploy wrapper listens to
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
