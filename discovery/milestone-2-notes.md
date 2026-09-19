# Milestone 2 Notes

## Summary

Milestone 2 establishes the Cloudflare D1-backed data model for Product Watcher. The app now has a durable schema for products, sellers, price snapshots, subscriptions, and notification logs, along with a typed DB access layer and validation helpers.

## Repo-specific findings

### 1) Local D1 is the reliable verification path

The repo uses Wrangler 3.x. Remote D1 creation commands trigger Cloudflare auth if the user is not already signed in, and in this environment the auth flow can require a browser approval. Local `--local` D1 migration commands are the dependable path for validation in this repo.

Recommended local verification flow:

```bash
cd apps/api
npx wrangler d1 migrations apply product-watcher-db --local --persist-to .wrangler/state
```

This path is sufficient for validating the schema in a local development environment without needing the Cloudflare dashboard.

### 2) Wrangler auth and migration behavior

A few quirks showed up while verifying the DB:

- `wrangler d1 create ...` can attempt OAuth login if the CLI is not authenticated.
- Once authenticated, the DB is created successfully and the config output includes the `binding`, `database_name`, and `database_id` values.
- Once a D1 database already exists, running the migration apply command reports `No migrations to apply!` when the migration set has already been executed.
- The local D1 migration runner will prompt to confirm applying migrations; accepting the prompt continues the schema creation normally.

### 3) The schema that was actually implemented

The final schema uses the following tables:

- `products`
- `sellers`
- `price_snapshots`
- `subscriptions`
- `notification_logs`

Key design choices:

- `id` is stored as `TEXT` UUID-like values for simplicity and consistent insert logic.
- `is_active` uses SQLite integer semantics (`0` / `1`) with `CHECK` constraints.
- `price_snapshots.status` is constrained to `success` or `failure`.
- `notification_logs.status` is constrained to `sent`, `failed`, `skipped`, or `duplicate_blocked`.
- `scraped_at` and `sent_at` are stored as ISO timestamp strings to keep sorting and reporting straightforward.
- `price_cents` is treated as an integer count of cents to avoid floating-point issues.

### 4) Validation rules were intentionally simple and deterministic

The intended milestone rules are enforced in the DB helper layer, not spread across route handlers.

Implemented rules:

- product name must be non-empty
- seller URL must be parseable as a URL
- subscription email must be valid enough for format checking
- successful price snapshots require a numeric price
- failed snapshots require error metadata
- notification logs require a valid status and reason

This keeps behavior explicit without over-engineering the app.

### 5) DB helper layer shape

The typed DB layer was placed in:

- `apps/api/src/db/index.ts`
- `apps/api/src/db/types.ts`
- `apps/api/src/db/validation.ts`

This centralizes:

- insert and fetch responsibilities
- environment binding expectations
- validation before writes
- row shaping and conversion points

This is the right pattern for future milestones, particularly when scheduler jobs or scraping tasks need to insert and query historical data consistently.

### 6) Local seed data is useful for future milestone work

The seed SQL file includes a realistic scenario with:

- one product (`Bike`)
- two sellers
- mixed success/failure history
- one active subscription
- one notification log entry

This is intentionally aligned with the later scraping and price-change milestones.

### 7) The tests are focused on validation behavior, not mock-only flows

The validation test file verifies real logic for:

- valid product payloads
- valid/invalid seller URLs
- valid/invalid email detection
- valid/invalid price snapshot success/failure states

This is a good lightweight regression guard for the business rules that later milestones rely on.

## Known quirks / gotchas

### Wrangler version drift

The repo is using Wrangler 3.x, which emits an update warning. It still works for local D1 operations, but future upgrades may change minor CLI prompts or migration output.

### Local DB identity

The local D1 database name and binding are configured in `wrangler.jsonc` as:

- binding: `DB`
- database_name: `product-watcher-db`

This should remain stable across local and deployed worker environments.

### `wrangler d1 create` may require auth

If the CLI is not authenticated, the command will open OAuth flow in the browser. This is normal and not a repo bug.

### `migrations apply` is idempotent per migration history

After the schema is applied once, rerunning the migration command reports `No migrations to apply!` because D1 tracks the applied migration records in its metadata table.

## Practical guidance for future milestones

- Keep DB access behind the storage helper layer instead of inline SQL in route files.
- Continue using integer cents for price storage and comparisons.
- Keep failure records in `price_snapshots` as historical facts rather than deleting them.
- Preserve raw error metadata for later scraper analysis and diagnostics.
- Reuse the validation helpers before any insert that depends on product/seller/subscription integrity.

## Final status

Milestone 2 is implemented and locally verified. The DB layer is ready to support the next milestone’s scraper and price-evolution logic without redesigning the schema.
