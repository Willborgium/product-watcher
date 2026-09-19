# Milestone 1 notes

## Deployed URLs

- Front-end (production): https://product-watcher-web.wjcustode.workers.dev
- Front-end (preview): https://\*-product-watcher-web.wjcustode.workers.dev
- Back-end (production): https://product-watcher-api.wjcustode.workers.dev
- Back-end (preview): https://\*-product-watcher-api.wjcustode.workers.dev

## Current status

- Front-end app is deployed successfully.
- Back-end worker is deployed successfully.
- The frontend still needs production environment wiring so it calls the deployed API instead of localhost.

## Required production wiring

1. Set the Pages environment variable `VITE_API_BASE_URL` to:
   `https://product-watcher-api.wjcustode.workers.dev`
2. Update the worker CORS origin list to include the deployed frontend origin:
   `https://product-watcher-web.wjcustode.workers.dev`
3. Verify the app loads and `/health` responds from the deployed frontend.

## Notes

- Local development uses `http://127.0.0.1:8787` and `http://127.0.0.1:5173`.
- The frontend defaults to localhost unless `VITE_API_BASE_URL` is set in the Cloudflare Pages environment.
- The worker currently accepts only localhost origins in CORS, which will block deployed frontend requests until updated.
