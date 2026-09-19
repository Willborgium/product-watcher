# Product Watcher

Product Watcher is a Cloudflare Pages + Worker monorepo for tracking product prices across seller pages and surfacing daily price-change insights.

## Local setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Start the API in one terminal:
   ```bash
   pnpm dev:api
   ```
3. Start the web app in another terminal:
   ```bash
   pnpm dev:web
   ```
4. Verify the health endpoint:
   ```bash
   curl http://127.0.0.1:8787/health
   ```
5. Open the app at http://127.0.0.1:5173

## Environment

Copy `.env.example` to `.env` in the repo root if you need to override values locally.

```bash
cp .env.example .env
```

## Troubleshooting

- CORS mismatch: confirm the frontend is calling `http://127.0.0.1:8787` and the worker allows that origin in development.
- Wrong API URL: check `VITE_API_BASE_URL` in the web app environment and ensure it matches the local worker port.
- Missing dependencies: run `pnpm install` from the repo root.

## Scripts

- `pnpm dev:api` — start the Cloudflare Worker locally
- `pnpm dev:web` — start the Vite frontend locally
- `pnpm build` — build all workspace packages
- `pnpm lint` — run workspace lint checks
- `pnpm test` — run workspace tests
- `pnpm check` — run lint, test, and build together

## Deployment

Merges to `main` trigger CI and deployment workflows. The API is deployed as a Cloudflare Worker and the web app is deployed to Cloudflare Pages.
