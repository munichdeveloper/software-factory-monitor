# Agent notes

- Read-only dashboard with one exception: approving a pull request the Factory handed over
  (`/harness approve <id>`, see README "Approving pull requests"). That comment is posted with the signed-in person's
  own GitHub token, never with an App or service credential, and only for an id the broker currently asks for. Add no
  other endpoints that change Factory state; other actions belong in the SF Manager.
- The only data sources are the broker's `GET /v1/queue` and `GET /v1/analytics` (cost page); do not call the GitHub
  API for queue or cost data (the App installation's request quota is shared with the Factory).
- UI text is German; code, comments and docs are English.
- `npm run check` and `npm run format:check` must pass.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
