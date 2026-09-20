# Milestone 4 Notes

## Summary

Milestone 4 adds the daily scraper workflow for active products and sellers, persistent price snapshots, bounded retries/timeouts, and active-only filtering for the scheduler. The implementation fits the repo’s existing pattern: validation stays in the DB validation layer, persistence remains in the DB helper layer, and route logic stays thin.

## What was implemented

### Scraper helper layer

- Added a dedicated scraper module at `apps/api/src/scraper.ts`.
- Included pure parsing helpers for:
  - `normalizeMoneyString(value: string)`
  - `parsePriceFromHtml(html: string)`
  - `classifyScrapeError(error)`
- Added a bounded scrape flow with `scrapeSellerPrice(url, attemptLimit, timeoutMs, fetcher)` that:
  - uses `AbortSignal.timeout(...)`
  - retries a small number of times
  - returns either a `success` result with integer-cent price or a structured `failure` result
- Added a `runDailyScrape(...)` runner that iterates candidates and persists results through the DB layer.
- Added a `recordSnapshotForSeller(...)` helper to centralize snapshot insertion.

### DB helper layer

- Added scheduler-query helpers in `apps/api/src/db/index.ts`:
  - `listActiveProducts(db)`
  - `listActiveSellersForProduct(db, productId)`
  - `listActiveSellersForScrape(db)`
  - `getLatestSuccessfulPriceSnapshot(db, sellerId)`
- Kept `is_active = 1` as the source of truth for scheduler eligibility.
- Preserved the append-only snapshot model: new rows are stored without rewriting prior historical snapshot data.

### Worker entrypoints

- Added a scheduled Worker callback in `apps/api/src/index.ts`.
- Added an internal route at `POST /internal/run-scrape` for local/manual verification.
- The worker job delegates to the scraper helper instead of duplicating fetch or parsing logic in the route layer.

## Design decisions and repo conventions honored

- Database access stays centralized in the storage layer rather than being spread across handlers.
- Route handlers remain thin and mostly transport-level.
- Disabled products and sellers are skipped by filtering at the DB query level, not by UI state.
- Snapshot failures are recorded with a stable error code, readable error message, and raw payload so future milestone logic can diagnose quality issues.
- The scraper is kept intentionally simple and durable rather than site-specific.

## Key findings and quirks discovered during implementation

### 1) The repo already had the schema and validation pieces, but not the scheduler logic

The `products`, `sellers`, and `price_snapshots` tables and validation helpers were already in place from earlier milestones. The missing part was the actual scheduler filtering and the scrape helper path. Once those were implemented, the project fit the milestone guidance cleanly.

### 2) D1 result shapes matter when matching the DB contract

The scraper candidate logic needed to handle both:

- plain arrays of seller rows from a direct helper call, and
- D1-style result payloads with a `results` property returned by `.all()`

The initial implementation assumed a single list shape and failed when the row loader returned a D1 result object. The fix was to normalize the input before filtering.

### 3) Active-only filtering must consider both seller and product state

The correct rule is not just `seller.is_active = 1`; it must also enforce `product.is_active = 1` for the seller’s product. The final implementation filters candidates with a join-based query in the DB layer and a compatible fallback in the scraper layer for testability.

### 4) Price parsing requires a deliberately tolerant normalization strategy

The parser accepts common numeric patterns like:

- `$19.99`
- `€19,99`
- `19,99 €`
- `19.99`

It normalizes them to integer cents for database storage. The implementation is intentionally simple and resilient rather than trying to be site-specific.

### 5) Testability required an injectable fetch path

To validate parser behavior without hitting real network resources, the scraper was made to accept a custom fetcher function in its core logic. This keeps the scraper pure enough for unit tests while still using the real `fetch` implementation in production.

### 6) The local seed script needed to be idempotent

The local verification script was re-running the same seed data on every verification pass, which triggered a unique `products.slug` SQLite constraint. The fix was to convert the seed inserts to `INSERT OR IGNORE` so the verification flow remains repeatable and safe for local reuse.

### 7) Wrangler warning noise is not a failure condition

The local verification runs reported a Wrangler version warning, but the database verification still completed successfully. This warning is informational and not a blocker for milestone completion.

## Verification evidence gathered

The end-to-end milestone verification command was run successfully:

```bash
cd c:/source/product-watcher/apps/api && pnpm test && pnpm build && pnpm db:verify
```

Evidence from the output:

- `2` test files passed
- `9` tests passed
- TypeScript build completed with no errors
- D1 verification completed with the message: `Local D1 verification flow completed.`

## Remaining notes / follow-up opportunities

- The scraper intentionally does not implement site-specific parsing heuristics beyond a general contract. That is consistent with the milestone scope.
- Milestone 5 can build on the persisted `price_snapshots` data to calculate price deltas and notification decisions without changing the underlying schema.
- A future enhancement could add a dedupe/no-op guard when a seller is already scraped for the same scheduled window, but the current append-only pattern is consistent with the repo’s choice to preserve historical snapshots.

## Final status

Milestone 4 is considered complete and verified against the project’s local DB, test suite, and TypeScript build checks.
