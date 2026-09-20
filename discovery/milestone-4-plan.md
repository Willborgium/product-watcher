# Milestone 4 Plan (Agent Execution Guide)

## Goal

Deliver Milestone 4 from [discovery/milestones.md](milestones.md):

- Build the daily scraper workflow for active products and sellers.
- Extract the list price from each seller page and store one daily snapshot per seller.
- Persist scrape failures with structured error metadata.
- Add retry and timeout behavior for unstable pages.
- Ensure disabled products and sellers are skipped consistently.

## Scope

In scope:

- Worker-level scheduler or cron job that runs daily.
- Server-side price retrieval logic for seller product pages.
- D1-backed insert flow for successful and failed `price_snapshots` rows.
- Active-only filtering for products and sellers.
- Retry and timeout policy for HTTP requests and parser failures.
- Local verification via Wrangler and HTTP checks.

Out of scope (Milestone 5+):

- Price comparison logic and notification rules.
- Email delivery or subscription handling.
- UI analytics pages.
- Authentication or admin dashboards.
- Per-seller parsing resilience beyond a general parser contract.

## Architecture Decisions

Use the existing Worker + D1 pattern created in Milestones 2 and 3.

Repository conventions already established in the repo:

- Keep database access helpers in `apps/api/src/db/index.ts` and validation in `apps/api/src/db/validation.ts`.
- Keep HTTP route handlers thin in `apps/api/src/index.ts`.
- Treat `is_active = 0` as the source of truth for skipping work; do not infer skip logic from UI or route state.
- Store both successes and failures in `price_snapshots`; do not delete rows to mark a failed day as missing.
- Preserve raw response/error metadata so later milestones can diagnose scraping quality and notification decisions.

Recommended implementation shape:

- Add a dedicated scraper module, for example `apps/api/src/scraper.ts`, with pure functions for:
  - selecting active products/sellers
  - scraping one URL
  - parsing a price from HTML
  - recording a success/failure snapshot
- Add a scheduled Worker handler in `apps/api/src/index.ts` or a dedicated scheduled file to run the daily loop.
- Keep all D1 inserts in the storage layer, not scattered in request handlers.
- Keep the daily job deterministic and idempotent enough that a rerun for the same date does not corrupt historical data.

### Data contract to preserve

This milestone should rely on the schema created in Milestone 2:

- `products` table has `id`, `name`, `slug`, `is_active`, `created_at`, `updated_at`, `disabled_at`
- `sellers` table has `id`, `product_id`, `url`, `normalized_url`, `is_active`, `created_at`, `updated_at`, `disabled_at`
- `price_snapshots` table has `id`, `seller_id`, `scraped_at`, `price_cents`, `price_text`, `status`, `error_code`, `error_message`, `raw_response`, `created_at`

The scheduler must filter with:

- active products only
- active sellers only
- skip sellers belonging to disabled products
- skip any seller whose `is_active = 0`

## Target Behavior

### Product + seller selection behavior

A daily run should:

1. list all products where `is_active = 1`
2. for each active product, list all sellers where `product_id = ?` and `is_active = 1`
3. skip sellers or products that are disabled or missing
4. run one scrape attempt per seller per scheduled run

If the app is configured for a single scheduled run per day, this is the expected behavior:

- one `price_snapshots` row per seller per run
- success rows store a numeric price in cents
- failure rows store `status = 'failure'` and error metadata
- a retry policy may retry the same seller one or more times before recording the final failure

### HTTP / parsing behavior

For each seller URL:

- fetch the page with a timeout
- use a simple HTML parser or regex-based extraction, depending on the app’s simplicity goals
- extract the product price from the page
- normalize the price to cents, e.g. `$19.99` => `1999`
- if parsing fails, create a `failure` snapshot with `error_code` and `error_message`

The milestone should not attempt to solve all site-specific parsing edge cases. It should implement the general contract that later milestones can build on.

### Retry and timeout policy

At minimum, implement explicit retry behavior:

- request timeout, e.g. 10 seconds or less for a fetch attempt
- failure after timeout or network error triggers a retry loop
- parser failure after a successful HTTP fetch is treated as a non-HTTP scrape failure
- do not retry forever; cap at a small number of attempts (for example 2 total attempts)

The policy should be deterministic and documented in code comments or in the plan, not left as magic numbers.

## Implementation Steps

### 1) Add a scraper helper layer

Create the main logic in a new helper module, for example:

- `apps/api/src/scraper.ts`

Responsibilities:

- `listScrapeCandidates(db)`
- `scrapeSellerPrice(url: string, attemptLimit?: number, timeoutMs?: number)`
- `parsePriceFromHtml(html: string): number | null`
- `normalizeMoneyString(value: string): number | null`
- `runDailyScrape(db)`
- `recordSnapshotForSeller(db, { sellerId, scrapedAt, ... })`

Required behavior:

- Keep scraping logic decoupled from HTTP route logic.
- Return a structured result object, for example:

```ts
{
  sellerId,
  status: 'success' | 'failure',
  priceCents: number | null,
  priceText: string | null,
  errorCode: string | null,
  errorMessage: string | null,
  rawResponse: string | null,
}
```

Acceptance for step:

- The scraper is testable as pure logic without needing a live full Worker request.
- The Worker route or schedule calls the helper, not the other way around.

### 2) Extend the DB helper layer for scheduled-reads

Update `apps/api/src/db/index.ts` to add the scheduler-specific queries needed by the scraper.

Add helpers such as:

- `listActiveProducts(db)`
- `listActiveSellersForProduct(db, productId)`
- `listActiveSellersForScrape(db)`
- `getLatestSuccessfulPriceSnapshot(db, sellerId)` (optional but useful for future milestone 5)
- a convenience helper that fetches one seller row by ID

Recommended logic:

- `listActiveProducts` should select `WHERE is_active = 1`.
- `listActiveSellersForProduct` should select `WHERE product_id = ? AND is_active = 1`.
- `listActiveSellersForScrape` should join products and sellers and filter out disabled rows.
- Use the same `getNowIso()` helper pattern already used in the repo.

Acceptance for step:

- Scheduler filtering is read from D1, not from route-local conditions.
- The scrape job can fetch only eligible products and sellers.

### 3) Implement the scraping loop

Add the main daily run in the Worker app.

Recommended operational flow:

```ts
const candidates = await listActiveSellersForScrape(db);
for (const seller of candidates) {
  const result = await scrapeSellerPrice(seller.url);
  await createPriceSnapshot(db, {
    sellerId: seller.id,
    scrapedAt: new Date().toISOString(),
    priceCents: result.priceCents,
    priceText: result.priceText,
    status: result.status,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    rawResponse: result.rawResponse,
  });
}
```

Important constraints:

- do not attempt to scrape disabled products or sellers
- do not overwrite prior snapshots for the same day unless the product explicitly requires overwrite semantics; the default should be a new row per run
- if a seller is already scraped for the same scheduled time, treat the run as idempotent or a no-op for that seller and date

This repo’s pattern favors a durable append-only archive, so prefer append-only snapshots over “update in place” semantics.

Acceptance for step:

- A scheduled run can iterate through active sellers and persist one snapshot per seller.
- Product disable state stops scraping without needing UI or route changes.

### 4) Implement fetch + price extraction

Use a simple fetch flow with one deterministic parser contract.

Recommended fetch behavior:

- use `fetch(url, { signal: AbortSignal.timeout(timeoutMs) })`
- treat network errors, DNS errors, and timeout errors as `failure`
- read response text with the HTML response body
- parse a price from the page text or DOM structure

Recommended parser behavior:

- support common numeric string patterns like `19.99`, `$19.99`, `€19,99`, and `19,99 €`
- normalize the value to integer cents
- if more than one candidate price appears, prefer a product-like price but do not overcomplicate the logic
- if no valid price is found, return a parse error and store a failure snapshot

Suggested safe rule:

- `parsePriceFromHtml` should be a pure helper that only extracts a candidate price string and returns a number in cents or `null`
- the fetch function handles the network and timeouts

Acceptance for step:

- scraping yields either a valid integer-cent price or a structured failure with stored error metadata
- failure reasons are not silent or blank

### 5) Persist failure metadata and structured errors

Update the error-handling flow so `price_snapshots` records include:

- `status`: `'success'` or `'failure'`
- `price_cents`: valid integer cents only for success rows
- `price_text`: original formatted value for success rows
- `error_code`: a short stable code, such as `timeout`, `network_error`, `parse_error`, `blocked_page`
- `error_message`: human-readable failure summary
- `raw_response`: either raw HTML or a compact error payload

Recommended codes:

- `timeout`
- `network_error`
- `rate_limited`
- `parse_error`
- `blocked_page`
- `unexpected_error`

Acceptance for step:

- Failed scrapes are stored as durable `price_snapshots` rows with useful diagnostic value.
- The code path does not silently swallow exceptions.

### 6) Add retry + timeout policy

Implement a small retry loop in the scraper helper.

Minimum policy:

- attempt fetch up to 2 times
- timeout after a fixed `timeoutMs` per attempt
- do not retry after successful parse with a valid price
- if the second attempt fails, persist the last failure and exit

Suggested pseudocode:

```ts
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    const html = await fetchPageWithTimeout(url);
    const price = parsePriceFromHtml(html);
    if (price !== null) return { status: 'success', priceCents: price, ... };
    throw new Error('parse_error');
  } catch (error) {
    lastError = error;
    if (attempt < maxAttempts) continue;
    return { status: 'failure', errorCode: classifyError(error), ... };
  }
}
```

Acceptance for step:

- unstable pages do not cause infinite loops
- each final failure is captured with one consistent error classification

### 7) Add route or schedule entrypoints

If the app already exposes `app.get('/health')` and `/db/health`, add a worker route for the scheduled run while keeping it out of public API surface if needed.

Preferred pattern:

- a scheduled trigger in the worker, e.g. `scheduled()` or a cron handler
- a local/diagnostic route like `POST /internal/run-scrape` can be added for debugging, but it is optional for this milestone

For this milestone, the main requirement is that the daily scheduler runs automatically in the Worker runtime. A manual route is useful later but not required to meet milestone 4’s definition of done.

Acceptance for step:

- the job can be triggered from a worker cron or local `wrangler dev` schedule
- the route or scheduled callback calls the scraper helper instead of duplicating scrape logic

### 8) Add regression coverage

Update `apps/api/src/db/validation.test.ts` and add scraper-focused tests where appropriate.

Add tests for:

- valid integer-cent normalization from a standard currency string
- parse error on missing price in HTML
- timeout/network failure classification
- active seller selection excludes disabled products/sellers
- failed scrape writes a `failure` snapshot with `error_code`
- successful scrape writes a `success` snapshot with integer cents

Keep tests focused on actual parsing, scheduler filtering, snapshot persistence, and retry logic. Do not test mock-only behavior.

Acceptance for step:

- the scraper logic is covered by tests for both happy and unhappy paths
- a regression in price extraction or skip logic is caught before deployment

## Verification Plan

Run the following checklist in order.

### A) Local DB and app setup

1. Install dependencies from the repo root:

```bash
pnpm install
```

2. Apply local D1 migrations:

```bash
cd apps/api
pnpm db:apply
```

3. Start the Worker locally:

```bash
pnpm dev
```

4. Confirm the app boots without DB binding or worker startup errors.

Pass criteria:

- the Worker starts cleanly
- `/health` returns a successful JSON response
- `/db/health` reports the database tables and binding is available

### B) Verify scheduler filtering

Seed or insert at least:

- one active product
- one active seller on that product
- one disabled product
- one disabled seller

Then run the scraper helper or a local trigger route.

Pass criteria:

- only active products/sellers are scraped
- disabled rows are skipped
- no active-row scrape is accidentally omitted

### C) Verify successful scrape persistence

Use a test seller URL that resolves to a known page with a visible price.

Expected result:

- `price_snapshots` row is inserted with:
  - `status = 'success'`
  - `price_cents` is an integer >= 0
  - `price_text` is present
  - `error_code` is null

Pass criteria:

- the snapshot row records the same normalized price as extracted from the page
- the row is stored under the correct `seller_id`

### D) Verify failure persistence

Use a deliberately invalid or unreachable URL, or intentionally block the fetch.

Expected result:

- `price_snapshots` row is inserted with:
  - `status = 'failure'`
  - `error_code` is set to a classification like `timeout` or `parse_error`
  - `error_message` is not empty
  - `price_cents` is null

Pass criteria:

- failure rows are durable and queryable
- no exception is swallowed without a recorded snapshot

### E) Verify retry and timeout behavior

Trigger a flaky or very slow URL.

Expected result:

- the scraper makes only a bounded number of attempts
- it returns a failure after the retry limit rather than looping forever
- the final snapshot reflects the last attempted failure

Pass criteria:

- retry count is limited
- timeout or network failures are classified consistently

### F) Run repo validation

After the scraper logic and tests are in place, run:

```bash
cd c:/source/product-watcher/apps/api
pnpm test
pnpm build
pnpm db:verify
```

Expected result:

- all scraper/validation tests pass
- TypeScript build succeeds
- local D1 verification is successful

## Definition of Done for Milestone 4

The milestone is complete when all of the following are true:

- The Worker can run a daily scrape loop across active products and sellers.
- A valid page result creates a `success` snapshot with an integer-cent price.
- A failed page result creates a `failure` snapshot with structured error details.
- Disabled products or sellers are skipped by the scheduler.
- Retry and timeout behavior is bounded and deterministic.
- Local verification passes with migrations, tests, and build checks.

## Practical Guidance for the Agent

- Keep the implementation simple and durable rather than over-abstracted.
- Prefer a single path for snapshot insertion to avoid duplicate data-write logic.
- Do not implement Milestone 5 comparison logic in this milestone.
- Do not add subscription or email logic here.
- Keep failures structured and queryable; this is the main data needed for the next milestone’s notification logic.
- When in doubt, use the existing repo pattern: validation in `apps/api/src/db/validation.ts`, storage helpers in `apps/api/src/db/index.ts`, and thin routes in `apps/api/src/index.ts`.
