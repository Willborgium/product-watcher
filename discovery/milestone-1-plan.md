# Milestone 1 Plan (Agent Execution Guide)

## Goal

Deliver Milestone 1 from [milestones.md](milestones.md):

- Frontend and backend run locally.
- Main branch auto-deploys to Cloudflare.
- Basic health endpoint and homepage are reachable.

## Scope

In scope:

- Project foundation and folder layout.
- Local dev scripts and environment setup.
- Minimal frontend app and minimal API worker.
- CI checks on pull requests.
- Auto deploy on merges to main.

Out of scope (Milestones 2+):

- Database schema and D1 migrations.
- Scraping logic.
- Subscriptions and notifications.
- Product domain features.

## Architecture Decisions

Use a monorepo with two apps:

- apps/web: static frontend (Vite + React + TypeScript), deployed to Cloudflare Pages.
- apps/api: Cloudflare Worker API (TypeScript + Hono), deployed as a Worker.

Why this shape:

- Fast setup and low friction for local development.
- Clear separation between UI and API.
- Easy to deploy both independently from one repo.

## Target Repository Structure

Create the following structure:

- package.json (workspace root)
- pnpm-workspace.yaml (or npm workspaces in package.json only)
- .node-version (or .nvmrc)
- README.md
- .env.example
- .github/workflows/ci.yml
- .github/workflows/deploy.yml
- apps/web/...
- apps/api/...

## Implementation Steps

### 1) Bootstrap workspace and tooling

1. Initialize root package metadata and workspaces.
2. Choose one package manager and keep it consistent (pnpm recommended).
3. Add root scripts:
   - dev:web
   - dev:api
   - build
   - lint
   - test
   - check (lint + test + build)
4. Pin Node version (example: 22 LTS).

Acceptance for step:

- Running install succeeds from repo root.
- Root scripts resolve both apps.

### 2) Create API worker app (apps/api)

1. Add TypeScript Worker project.
2. Add dependencies:
   - hono
3. Add dev dependencies:
   - wrangler
   - typescript
   - vitest (optional now, recommended)
4. Create routes:
   - GET /health -> 200 JSON: { ok: true, service: "api", env: "<env>", timestamp: "ISO" }
   - GET / -> 200 JSON simple welcome message.
5. Configure CORS for frontend origin in development.
6. Add wrangler config for:
   - name: product-watcher-api
   - compatibility_date
   - vars for environment labels

Acceptance for step:

- Local API starts via wrangler dev.
- GET /health responds 200 with JSON payload.

### 3) Create frontend app (apps/web)

1. Scaffold Vite React TypeScript app.
2. Keep UI minimal for Milestone 1:
   - Title: Product Watcher
   - Status card that displays "API reachable" or "API unreachable"
3. Add environment variable for API base URL:
   - VITE_API_BASE_URL
4. On page load, call API /health and render result.

Acceptance for step:

- Local web app starts.
- Browser homepage loads and renders API status.

### 4) Local environment and docs

1. Add .env.example with:
   - VITE_API_BASE_URL=http://127.0.0.1:8787
   - API_ENV=local
2. Document local run steps in README:
   - install
   - run API and web in separate terminals
   - verify endpoints
3. Add troubleshooting notes for common issues:
   - CORS mismatch
   - wrong API URL
   - missing dependencies

Acceptance for step:

- A new contributor can follow README and run both services locally.

### 5) CI workflow on pull requests

Create .github/workflows/ci.yml:

- Trigger: pull_request to main.
- Jobs:
  - install dependencies with lockfile
  - lint
  - test
  - build web
  - typecheck worker/app if separate from build

Keep CI strict:

- Fail fast on lint/test/build errors.

Acceptance for step:

- PR opens and CI executes all checks.
- Failing lint/test/build blocks merge.

### 6) Deploy workflow on push to main

Create .github/workflows/deploy.yml:

- Trigger: push to main.
- Job 1 deploy-api:
  - use Wrangler or Cloudflare action
  - deploy apps/api Worker
- Job 2 deploy-web:
  - build apps/web
  - deploy to Cloudflare Pages project

Required GitHub Secrets:

- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

Required Cloudflare setup:

- Existing Pages project for web (example: product-watcher-web)
- Worker deployment permissions in token

Acceptance for step:

- Merge to main triggers workflow.
- Both API and web publish successfully.

### 7) Minimal production-safe config

1. Add separate environments in wrangler config (dev/prod) if needed.
2. Ensure API response includes no secrets.
3. Ensure frontend only exposes non-sensitive public vars.

Acceptance for step:

- No secrets committed.
- Production build and deploy complete without manual edits.

## Verification Plan

Run this checklist in order.

### A) Local verification

1. Install dependencies from repo root.
2. Start API locally.
3. Confirm health endpoint:
   - GET http://127.0.0.1:8787/health returns 200.
4. Start web locally.
5. Open homepage and confirm:
   - Page renders Product Watcher title.
   - API status shows reachable.

Pass criteria:

- Frontend and backend run locally and communicate.

### B) CI verification

1. Create a feature branch.
2. Push branch and open PR.
3. Confirm ci.yml runs lint/test/build.
4. Optionally introduce then fix a deliberate lint error to validate blocking behavior.

Pass criteria:

- CI is enforced and meaningful.

### C) Deployment verification

1. Merge PR to main.
2. Confirm deploy workflow runs automatically.
3. Confirm Worker endpoint is reachable in cloud:
   - GET /health returns 200.
4. Confirm Pages site is reachable and homepage loads.
5. Confirm homepage can call deployed API /health.

Pass criteria:

- Main branch auto-deploys both services.
- Health endpoint and homepage are reachable in production.

## Milestone 1 Exit Checklist

Mark Milestone 1 complete only when all are true:

- Local web and API run from clean clone.
- API /health endpoint works locally and in production.
- Homepage works locally and in production.
- PR CI validates lint/test/build.
- Push to main deploys automatically to Cloudflare.
- README documents setup and verification steps.

## Suggested Task Breakdown for an Agent

1. Build repository scaffolding and workspace scripts.
2. Implement API worker with / and /health.
3. Implement web app with health status UI.
4. Write README and .env.example.
5. Add CI workflow and validate it.
6. Add deployment workflow and validate on main.
7. Run full verification checklist and record results.
