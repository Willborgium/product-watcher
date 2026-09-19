# Product Watcher Milestones

This document outlines the major implementation steps to deliver the project from your current spec and answers.

## Milestone 1: Project Foundation and Environments

- Choose stack and initialize app structure for Cloudflare Pages + Worker API.
- Add local development scripts, environment configuration, and repo documentation.
- Set up CI to run checks on pull requests and deploy on merge to main.

Definition of done:
- Frontend and backend run locally.
- Main branch auto-deploys to Cloudflare.
- Basic health endpoint and homepage are reachable.

## Milestone 2: Data Model and Durable Storage

- Finalize core entities and schema:
  - Product (logical item being tracked)
  - Seller (URL attached to a product)
  - PriceSnapshot (daily scrape results)
  - Subscription (email linked to product)
  - NotificationLog (emails sent per day)
- Use D1 as primary queryable storage (free tier permitting).
- Add migrations and seed data flow.

Definition of done:
- Schema is created with migrations.
- Historical snapshots and scrape failures are persisted.
- Data model supports "keep history forever".

## Milestone 3: Product and Seller Management API

- Implement API endpoints to create, update, list, and disable products.
- Implement API endpoints to add/remove/update seller URLs per product.
- Enforce simple URL validation and deduplicate exact seller URLs per product.

Definition of done:
- Product and seller CRUD is functional via API.
- Scraping toggle at product level is persisted.
- Disabled products are clearly marked for scheduler filtering.

## Milestone 4: Scraper Engine and Daily Scheduler

- Build scraping workflow that runs daily on active products/sellers.
- Extract list price from seller product pages and store one daily snapshot per seller.
- Persist scrape failures with structured error details.
- Add retry and timeout policy for unstable pages.

Definition of done:
- Daily run executes automatically.
- Successful and failed scrape results are both stored.
- Skip logic works for disabled products.

## Milestone 5: Price Change Logic and Notification Rules

- Implement comparison logic against previous successful scrape.
- Trigger notification when current price is lower than previous successful price.
- If no previous successful scrape exists, or previous successful scrape is older than 10 days, notify anyway.
- Add dedupe protection to avoid duplicate notifications in a single day.

Definition of done:
- Notification decision is deterministic and tested for edge cases.
- Notification send attempts are logged with outcomes.

## Milestone 6: Email Subscription and Delivery

- Build subscribe/unsubscribe endpoints (no authentication).
- Validate email format and maintain per-product subscriptions.
- Implement daily notification email formatting with product/seller/price context.
- Integrate with a free-tier-compatible email sending path on Cloudflare.

Definition of done:
- Users can subscribe and unsubscribe by product.
- Daily notification emails are sent when rules match.
- Delivery failures are captured for debugging.

## Milestone 7: Analytics UI (Public Site)

- Build product list page showing tracked products and current status.
- Build product detail page with:
  - Line chart of historical prices
  - Seller list sorted low-to-high by latest price
  - Lowest price today and lowest historical price
  - Scrape history indicators (green/red) per seller/date
  - Click-through detail for a day showing price or error
- Add subscribe/unsubscribe forms on product pages.

Definition of done:
- Public users can view analytics without login.
- All requested product metrics are visible and accurate.
- Scrape failures are visible in UI as first-class data.

## Milestone 8: Reliability, Cost Guardrails, and Observability

- Add structured logs for scraping, notifications, and API errors.
- Add minimal rate limiting/abuse controls for public subscription endpoints.
- Add safeguards for free-tier limits (request caps, query efficiency, retries).
- Add operational dashboard queries (recent failures, send failures, scrape success rate).

Definition of done:
- Production logs are sufficient to diagnose scrape or email issues.
- Free-tier usage is monitored and does not spike unexpectedly.

## Milestone 9: QA, Backfill Utilities, and Launch Readiness

- Add tests for scraping workflow, notification rules, and API validation.
- Add a manual/cron trigger to run a scrape outside schedule for debugging.
- Add admin-safe scripts for data checks and basic repair tasks.
- Finalize launch checklist and documentation.

Definition of done:
- Core flows are covered by automated tests.
- Team can validate end-to-end behavior before release.
- Runbook exists for common production issues.

## Milestone 10: Post-Launch Improvements (Optional)

- Add better parsing resilience per seller domain.
- Add richer analytics (trend deltas, rolling min/max windows).
- Add data export and optional historical retention controls.

Definition of done:
- Enhancements are prioritized after observing real usage.
