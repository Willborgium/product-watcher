# Milestone 3 Notes

## Summary

Milestone 3 closes the product and seller management layer for Product Watcher. The API now supports CRUD-style product management, seller URLs under each product, active/inactive toggles, validation before writes, and duplicate seller URL prevention per product. This milestone is implemented in the Worker API layer with D1-backed storage logic and a local verification flow.

## Repo-specific findings

### 1) Product and seller behaviors were intentionally soft-disable based

The repo’s design already leans toward preserving historical records rather than deleting them. For this milestone, product and seller state changes were implemented as soft-disable semantics:

- `is_active = 0` is the source of truth for scheduler filtering
- `disabled_at` is set when disabled
- `disabled_at` is cleared when enabled
- rows are not physically removed so historical price snapshots and seller relationships remain valid

This matches the milestone guidance and avoids downstream issues in later scraper and notification work.

### 2) Validation belongs in the DB helper layer, not in route handlers

The main pattern used in this repo is:

- validation helpers in `apps/api/src/db/validation.ts`
- typed DB helpers in `apps/api/src/db/index.ts`
- thin HTTP routes in `apps/api/src/index.ts`

This keeps route handlers predictable and avoids ad hoc SQL or business logic scattered across API endpoints.

### 3) URL normalization and dedupe are critical business rules

The repo requires seller URLs to be normalized with `new URL(value).toString()`, and deduplication is enforced against `normalized_url` per product via the unique D1 index.

Important behavior discovered during implementation:

- duplicate exact seller URLs are rejected within the same product
- case differences in URLs are normalized to the same form when comparing
- the raw URL is preserved as stored text while dedupe compares the normalized URL
- this prevents duplicates without losing the original representation for display or debugging

### 4) Product slugging is derived, but only when appropriate

The validation helper generates a slug from the product name if one is not provided. The update flow uses the same deterministic logic; when a new name is provided without a slug, the slug is derived from the new name.

This avoids random slug handling and keeps product naming stable.

### 5) The API route layer is intentionally simple and predictable

The route contract uses the repo’s light approach:

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PUT /products/:id`
- `PATCH /products/:id/disable`
- `PATCH /products/:id/enable`

And for sellers:

- `GET /products/:productId/sellers`
- `POST /products/:productId/sellers`
- `GET /products/:productId/sellers/:sellerId`
- `PUT /products/:productId/sellers/:sellerId`
- `DELETE /products/:productId/sellers/:sellerId`
- `PATCH /products/:productId/sellers/:sellerId/disable`
- `PATCH /products/:productId/sellers/:sellerId/enable`

The delete route behaves as a soft disable to preserve seller identity in the database, which is the safest choice for this app.

### 6) The existing schema already matched the milestone requirements

The D1 schema already satisfied the main milestone constraints:

- `products.is_active` is integer `0`/`1`
- `sellers.product_id` references `products.id`
- `sellers.normalized_url` is stored and unique per product via the index
- `sellers.is_active` defaults to `1`
- `disabled_at` exists on both `products` and `sellers`

No additional migration was required for the core requirement set; the schema and constraints were already in place.

### 7) Local verification is reliable when using the project-local Wrangler entry

One of the key session discoveries was that the repo’s D1 verification script initially attempted to spawn `npx` from a Node script. On this Windows environment, that failed because `npx` was not resolvable the way the script assumed.

The fix was to run the local Wrangler CLI via Node directly using the package-resolved entry point:

```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const wranglerEntry = require.resolve("wrangler/bin/wrangler.js");
```

Then invoking:

```js
execFileSync(process.execPath, [wranglerEntry, ...args], {
  cwd: apiDir,
  stdio: "inherit",
});
```

This made the repo’s own `db:verify` script work reliably in Windows and preserves the intended local D1 verification flow.

### 8) Route handling must preserve important status codes

The route layer was implemented to return the expected statuses:

- `400` for validation and malformed payloads
- `404` for missing products/sellers
- `409` for duplicate seller URL conflicts
- `500` for unexpected database failures

This aligns with the milestone guidance and keeps the API predictable for downstream client code.

## Tests and validation findings

### Validation tests were expanded to cover milestone behavior

The API test file now verifies:

- valid product name and slug generation
- invalid blank product names
- valid seller URL normalization
- invalid malformed seller URLs
- duplicate URL detection against same-product data
- shape of the validation contract used across the app

### Real verification path

The repo was validated with:

```bash
cd c:/source/product-watcher/apps/api && pnpm test && pnpm build && pnpm db:verify
```

Fresh results from that run:

- 1 test file passed
- 4 tests passed
- TypeScript build completed successfully
- local D1 migration verification completed successfully

## Known quirks / gotchas

### Wrangler 3.x update warning

Wrangler emits an update warning during local D1 operations, but it continues to work correctly for this repo’s local verification path. It is informational rather than a blocker.

### `db:verify` script is environment-sensitive

The script is expected to work from the API folder and uses the repo-local Wrangler package. It is not safe to assume `npx` will always resolve in every shell environment, especially on Windows.

### Duplicate detection requires exact normalized equivalence

The system compares normalized URLs, not just raw strings. This means semantically equivalent URLs are treated as duplicates, which is the desired scheduler-safe behavior.

### Soft-disable is the repo’s default semantics

This project’s historical data and downstream relationships are designed to retain rows. Disabling rows rather than deleting them is a deliberate design decision and should remain consistent across future milestones.

## Practical guidance for future milestones

- Keep validation centralized in the DB helper layer.
- Continue using soft-disable semantics for seller and product lifecycle state.
- Treat `normalized_url` as the canonical dedupe key.
- Prefer `is_active` checks for scheduler logic instead of route or UI heuristics.
- Keep database verification in the local D1 flow when validating before deploying.

## Final status

Milestone 3 is implemented and locally verified. The API now supports the required product and seller lifecycle behaviors with deterministic validation and D1-backed persistence.
