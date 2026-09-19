# Milestone 2 Plan (Agent Execution Guide)

## Goal

Deliver Milestone 2 from [milestones.md](milestones.md):

- Finalize the core data model for the app.
- Persist product, seller, snapshot, subscription, and notification history in durable storage.
- Use a query-friendly Cloudflare data store for historical price analysis and daily scraping.
- Ensure the schema supports "keep history forever" and records both successful and failed scrapes.

## Scope

In scope:

- D1 schema design and migrations for the core entities.
- Product and seller entity definitions.
- Price snapshot storage for successful and failed daily scrapes.
- Email subscription storage and notification log persistence.
- Seed/dev data flow for testing and local development.
- Minimal repository/service code to insert and query the data model.

Out of scope (Milestones 3+):

- Product CRUD endpoints and seller management API routes.
- Scrape engine and scheduler.
- Email sending logic or notification rules.
- Price comparison logic or UI analytics pages.
- Authentication or user accounts.

## Architecture Decisions

Use D1 as the canonical database for this milestone.

Why this choice:

- It is Cloudflare-native and fits the app’s free-tier hosting model.
- It supports structured, queryable historical data for analytics and reporting.
- It is a good fit for storing product, seller, snapshot, and subscription records.
- It keeps the data model simple enough to be queried from Worker handlers and future cron jobs.

Repository-level conventions:

- Keep all DB access in the Worker app under a small storage layer, not spread across route handlers.
- Put SQL migration files into a dedicated `migrations/` folder.
- Prefer explicit, typed query methods over ad hoc raw SQL in route code.
- Keep the schema deterministic so it can be recreated in local dev and CI.

## Target Data Model

The app has five core entities. Use these names exactly unless a future code task clearly requires a rename.

### 1) Product

Represents one logical item being tracked.

Required fields:

- id: string or integer primary key
- name: text, required
- slug: text, unique, derived from product name for future routes
- is_active: boolean, default true
- created_at: ISO datetime
- updated_at: ISO datetime
- disabled_at: nullable ISO datetime

Notes:

- This is the aggregate object that multiple seller URLs belong to.
- A product has many sellers, many snapshots, and many subscriptions.
- `is_active` should be used to skip daily scraping for disabled products.

### 2) Seller

Represents a URL attached to a product.

Required fields:

- id: string or integer primary key
- product_id: foreign key to products.id
- url: text, required
- normalized_url: text, required, derived from the canonical URL string
- is_active: boolean, default true
- created_at: ISO datetime
- updated_at: ISO datetime
- disabled_at: nullable ISO datetime

Constraints:

- One product should not have duplicate exact seller URLs.
- Use a unique index on `(product_id, normalized_url)`.
- Keep the raw URL for display, but normalize for dedupe and comparison.

### 3) PriceSnapshot

Represents one scrape result for one seller on one day.

Required fields:

- id: string or integer primary key
- seller_id: foreign key to sellers.id
- scraped_at: ISO datetime, required; this is the actual scraped timestamp
- price_cents: integer or nullable
- price_text: text or nullable
- status: text enum, values: `success` or `failure`
- error_code: text or nullable
- error_message: text or nullable
- raw_response: text or JSON string, nullable
- created_at: ISO datetime

Business rules:

- Persist both successful and failed scrape attempts.
- A successful record should store the canonical list price in cents.
- A failed record should store error metadata instead of a price.
- Do not delete historical data; this is a permanent archive.

Suggested status values:

- `success` for a valid price read
- `failure` for timeout, blocked page, invalid markup, or any non-price result

### 4) Subscription

Represents an email subscribed to a product.

Required fields:

- id: string or integer primary key
- product_id: foreign key to products.id
- email: text, required
- normalized_email: text, required
- is_active: boolean, default true
- created_at: ISO datetime
- updated_at: ISO datetime
- unsubscribed_at: nullable ISO datetime

Constraints:

- One active subscription per product/email pair.
- Use a unique index on `(product_id, normalized_email)` where `is_active = 1` if supported by the DB pattern, or enforce it in app logic and DB constraints where feasible.
- A subscription may be disabled instead of physically deleted so we preserve an audit trail.

### 5) NotificationLog

Represents one notification decision or send attempt.

Required fields:

- id: string or integer primary key
- product_id: foreign key to products.id
- subscription_id: foreign key to subscriptions.id, nullable
- seller_id: foreign key to sellers.id, nullable
- sent_at: ISO datetime
- status: text enum, values: `sent`, `failed`, `skipped`, `duplicate_blocked`
- price_cents: integer or nullable
- previous_price_cents: integer or nullable
- reason: text, required
- error_message: text or nullable
- dedupe_key: text, nullable
- created_at: ISO datetime

Business rules:

- Log every send attempt and every skipped notification decision.
- `dedupe_key` should support single-day duplicate protection in later milestones.
- Keep logs forever; do not delete historical notification records.

## Database Design Requirements

Implement database structure with these core constraints.

### Tables

Create the following tables:

- `products`
- `sellers`
- `price_snapshots`
- `subscriptions`
- `notification_logs`

### Recommended indexes

Add indexes for the query patterns the app will need later:

- `products`: `is_active` + `created_at`
- `sellers`: `product_id`, `is_active`, `normalized_url`
- `price_snapshots`: `seller_id`, `scraped_at`, `status`
- `subscriptions`: `product_id`, `is_active`, `normalized_email`
- `notification_logs`: `product_id`, `sent_at`, `status`, `dedupe_key`

### D1 migration strategy

Use one migration per schema change, not a single giant migration. Example:

- `0001_create_products.sql`
- `0002_create_sellers.sql`
- `0003_create_price_snapshots.sql`
- `0004_create_subscriptions.sql`
- `0005_create_notification_logs.sql`
- `0006_add_indexes_and_constraints.sql`

If a migration is needed to add a `normalized_*` field, include it in the schema versioning logic and ensure the app expects current schema.

## Implementation Steps

### 1) Define the schema and SQL contract

1. Create a schema document or SQL migration plan that lists the exact tables, columns, constraints, and indexes.
2. Decide on exact types for all timestamp and numeric fields.
3. Standardize on `INTEGER` cents for price values to avoid floating-point problems.
4. Decide on `TEXT` statuses and `JSON`/`TEXT` raw payload storage patterns.

Acceptance for step:

- Every milestone 2 entity has a clear table definition.
- Price comparison logic can rely on integer cents in later milestones.

### 2) Add D1 binding and local DB tooling

1. Add a D1 database binding to the Worker config in `apps/api/wrangler.jsonc`.
2. Name the binding clearly, for example `DB` or `PRODUCT_WATCHER_DB`.
3. Add a local database setup command in package scripts or a documented migration runner.
4. Ensure the API worker can read the DB binding from `c.env`.

Required config shape:

- `d1_databases`: list of database objects with `binding`, `database_name`, and `database_id`
- Use `local` database config for dev if the environment supports it.
- Keep the binding name stable across local and deployed workers.

Acceptance for step:

- `wrangler` can resolve the configured database binding.
- The Worker app can access the DB without guessing at environment names.

### 3) Create D1 migrations

1. Write the migration files in a consistent, ordered sequence.
2. Define `PRIMARY KEY`, `FOREIGN KEY`, and `UNIQUE` constraints where possible.
3. Add `CHECK` constraints for statuses if supported and practical.
4. Add indexes for `seller_id`, `product_id`, and time-based filtering.

Required migration content:

- `products` table with active state and timestamps.
- `sellers` table with `product_id` plus a unique dedupe index on product + normalized URL.
- `price_snapshots` table with `seller_id`, timestamp, status, and nullable price/error fields.
- `subscriptions` table with product/email uniqueness.
- `notification_logs` table with product/subscription/seller references and status.

Acceptance for step:

- Applying migrations creates the full schema in a clean local database.
- No table is missing and no required foreign keys are absent.

### 4) Add a typed DB access layer

Create a storage helper module inside the API app, such as:

- `src/db/schema.ts`
- `src/db/queries.ts`
- `src/db/types.ts`

Responsibilities:

- Wrap `c.env.DB.prepare(...)` and `bind(...)` calls.
- Expose typed helper functions for inserts and reads.
- Centralize conversion between DB rows and app-level data objects.
- Add explicit functions for:
  - createProduct
  - addSeller
  - createPriceSnapshot
  - createSubscription
  - addNotificationLog
  - getProductById
  - getSellersForProduct
  - getRecentSnapshotsForSeller
  - getActiveSubscriptionsForProduct

Acceptance for step:

- The API code does not inline raw SQL through many route files.
- Query results are shaped consistently and match the schema.

### 5) Implement the app-level validation rules

Before writing to the database, enforce the rules that later milestones depend on.

For each relevant entity:

- Product name must not be blank.
- Seller URL must be non-empty and parseable as a URL.
- Exact duplicate seller URLs per product are rejected.
- Subscription email must be valid enough for format checking.
- Price snapshot records must either have a price or a failure reason.
- Notification logs must carry a status and reason.

Do not over-engineer these rules. Keep them intentionally simple and deterministic.

Acceptance for step:

- Invalid product/seller/subscription records do not get stored.
- The app rejects duplicate seller URLs and duplicate active subscriptions.

### 6) Add seed and local test data flow

1. Create a small seed helper or SQL script for local development.
2. Seed at least one product, two sellers, a few snapshots, and one subscription record.
3. Include both successful and failed price snapshots to validate later UI and scheduler behavior.
4. Keep the data helpful for milestone 3 and milestone 4 work.

Suggested local scenario:

- Product: `Bike`
- Sellers: two product URLs with different domains
- Snapshots: one success, one failure, and at least two historical values across days
- Subscription: one active email subscription

Acceptance for step:

- A local developer can seed data with a single command or script and immediately query the tables.
- Seed data captures the “keep history forever” model and mixed success/failure records.

### 7) Add a lightweight verification harness

Create the simplest possible API or script checks for milestone 2 to prove the schema works.

Examples:

- A small Worker route or route helper that returns DB metadata.
- A Node script that executes D1 statements against the local DB.
- A test file that runs a minimal schema insert/query flow.

The purpose is to verify that:

- inserts succeed
- foreign keys work
- queries return expected rows
- failure records are stored without price values

Acceptance for step:

- A basic end-to-end migration + insert + query flow works in the project environment.

## Verification Plan

Run this checklist in order.

### A) Migration verification

1. Start the project in a clean repo state.
2. Apply migrations to the local D1 database.
3. Confirm that all five tables exist.
4. Confirm expected indexes and constraints were created.

Pass criteria:

- No migration fails.
- The database schema matches the milestone 2 design.

### B) Insert verification

1. Insert one product.
2. Insert two sellers for that product with different URLs.
3. Insert one successful snapshot and one failed snapshot for the same seller.
4. Insert one subscription.
5. Insert one notification log row.

Pass criteria:

- All inserts succeed.
- Querying the tables returns the inserted rows.
- Failed snapshots store an error but no price.

### C) Constraint verification

1. Attempt to insert a duplicate exact seller URL for the same product.
2. Attempt to add a second active subscription for the same product and email.
3. Attempt to insert a snapshot with an invalid status.

Pass criteria:

- The DB rejects invalid records or app-level validation blocks them.
- The product does not accumulate bad duplicates.

### D) Historical-data verification

1. Insert multiple daily snapshots for a seller across different dates.
2. Query recent snapshots in date order.
3. Query a seller’s snapshot history and confirm the records remain available.

Pass criteria:

- Price history is durable and queryable.
- Older records are not discarded.
- The system matches the requirement to keep history forever.

### E) Seed-data verification

1. Run the local seed flow.
2. Query all core tables with a small script or route.
3. Confirm there is enough information to support later milestones.

Pass criteria:

- Seed data includes product, sellers, snapshots, and subscription records.
- The seed data looks realistic enough to support upcoming scraper and notification work.

## Milestone 2 Exit Checklist

Mark Milestone 2 complete only if all of the following are true:

- D1 schema is created and migrations are stable.
- Product, seller, snapshot, subscription, and notification tables exist.
- Historical successful and failed snapshots are stored durably.
- Duplicate exact seller URLs are prevented.
- Product-level active/inactive state is tracked in the schema.
- Data model supports “keep history forever.”
- Seed data can be created locally for testing and future milestones.
- A basic insert/query verification flow passes.

## Suggested Task Breakdown for an Agent

1. Review the milestone 2 entity model and confirm exact schema choices.
2. Add D1 database binding and migration folder structure.
3. Implement the migration SQL files for all five core tables.
4. Add typed DB queries and validation helpers.
5. Seed realistic local data with mixed success/failure snapshots.
6. Run migration + insert + query verification checks.
7. Confirm the database supports future price comparison and scraping work.
