# Milestone 3 Plan (Agent Execution Guide)

## Goal

Deliver Milestone 3 from [milestones.md](milestones.md):

- Implement API endpoints to create, update, list, and disable products.
- Implement API endpoints to add, update, list, and remove seller URLs per product.
- Enforce URL validation and deduplicate exact seller URLs per product.
- Persist product-level scrape toggles so the scheduler can skip disabled products.

## Scope

In scope:

- Product API resource in the Worker app.
- Seller API resource nested under a product.
- Validation rules for product names, seller URLs, and active/inactive toggles.
- D1 reads/writes for product and seller CRUD.
- Local verification through Wrangler + HTTP requests.

Out of scope (Milestones 4+):

- Scraper engine and cron execution.
- Price extraction parsing and retry logic.
- Notification emails or subscription endpoints.
- UI pages or analytics.
- Authentication or user ownership.

## Architecture Decisions

Use the existing Worker + D1 pattern from Milestone 2.

Repository conventions already established in the repo:

- Keep DB logic inside the storage layer under `apps/api/src/db`.
- Keep HTTP handlers thin and route-focused in `apps/api/src/index.ts`.
- Validate all inbound payloads before any D1 write.
- Treat `is_active` as the source of truth for scheduler filtering, not a soft-delete flag in route logic.
- Prefer explicit `updated_at`/`disabled_at` writes over ad hoc mutation logic.

### API contract shape

Do not invent a complex REST layer. Keep the API predictable and easy to test with JSON directly.

Product endpoints:

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PUT /products/:id`
- `PATCH /products/:id/disable`
- `PATCH /products/:id/enable`

Seller endpoints:

- `GET /products/:productId/sellers`
- `POST /products/:productId/sellers`
- `GET /products/:productId/sellers/:sellerId`
- `PUT /products/:productId/sellers/:sellerId`
- `DELETE /products/:productId/sellers/:sellerId`
- `PATCH /products/:productId/sellers/:sellerId/disable`
- `PATCH /products/:productId/sellers/:sellerId/enable`

Notes:

- `PUT` is acceptable for full product updates and full seller updates.
- `DELETE` for seller removal can be treated as a soft disable if preserving history is important; either approach is okay as long as the behavior is consistent and documented.
- For this milestone, the safest default is to keep rows present and mark them inactive instead of deleting them from D1, because historical price snapshots and subscription relationships may rely on seller identity.

## Target Behavior

### Product behavior

A product should support:

- create with a required non-empty `name`
- optional `slug` override, otherwise derive via slugify
- persist `is_active` as `1` / `0`
- set `created_at` and `updated_at` on create
- update name and maybe slug
- set `disabled_at` when disabled, and clear it when enabled
- list products in default stable order (for example `created_at DESC` or `name ASC`)

Business rules:

- Product names cannot be blank.
- A slug should be derived automatically if missing.
- Disabled products must be clearly discoverable in queries and included in the scheduler skip logic.

### Seller behavior

A seller should support:

- create only when `productId` is present and valid
- require a valid absolute `url`
- normalize the URL before storing (`new URL(value).toString()` is enough for this repo)
- ensure duplicate exact seller URLs are rejected per product
- allow a seller to be updated in place (URL, active state)
- preserve raw URL for display while using `normalized_url` as the dedupe key

Requirements:

- `sellers` must enforce uniqueness on `(product_id, normalized_url)`.
- `GET /products/:productId/sellers` should return active and inactive sellers or maybe active-only depending on endpoint semantics; the safest choice is to return all sellers for that product with `is_active` included, and the client can filter as needed.
- If a seller is disabled, it should not be considered active for future scraping but should remain stored for historical context.

## Implementation Steps

### 1) Extend the DB helper layer

Update `apps/api/src/db/index.ts` and `apps/api/src/db/types.ts` with typed helpers for product and seller management.

Add helpers such as:

- `listProducts(db)`
- `getProductById(db, id)`
- `createProduct(db, input)`
- `updateProduct(db, id, patch)`
- `setProductActiveState(db, id, isActive)`
- `listSellersForProduct(db, productId)`
- `getSellerById(db, id)`
- `createSeller(db, input)`
- `updateSeller(db, id, patch)`
- `setSellerActiveState(db, id, isActive)`
- `deleteSeller` or `disableSeller` depending on chosen semantics

Key rules for the helper layer:

- Validate input before insert or update.
- Always use `updated_at = new Date().toISOString()` when mutating a row.
- Do not allow duplicate exact seller URLs within the same product.
- When disabling, set `is_active = 0` and `disabled_at = now`; when enabling, flip the state back and clear `disabled_at`.

Acceptance for step:

- Product and seller insert/update flows are centralized in one storage layer.
- No route file contains ad hoc SQL or raw validation logic.

### 2) Strengthen validation helpers

Update `apps/api/src/db/validation.ts` so that it covers product and seller mutations consistently.

Add / adjust validation functions for:

- product name required and trimmed
- optional slug generation with `slugify()`
- normalized URL generation and duplicate detection helper input
- valid seller URL requirement
- active state normalization for boolean toggles

Recommended logic:

- `validateProductPayload(payload)` should allow `name` and optional `slug`.
- `validateSellerInput(payload)` should validate `productId` and `url` and return `normalizedUrl`.
- For updates, use the same rules but allow partial inputs and fill in unchanged values.

Acceptance for step:

- Blank names are rejected.
- Invalid URLs are rejected before insert.
- Validation is deterministic and reused across route handlers and DB helpers.

### 3) Add API endpoints in the Worker

Update `apps/api/src/index.ts` to add the product and seller routes.

Implementation pattern:

- Parse JSON body from `c.req.json()`.
- Validate payload with the DB helper or validation helper.
- Call the DB helper to create/update/list rows.
- Return JSON with explicit status and payload fields.
- Use `400` for validation issues, `404` for missing product/seller, `409` for duplicate seller URL, and `500` for unexpected DB errors.

Recommended route behavior:

- `POST /products`: create a product.
- `GET /products`: list all products.
- `GET /products/:id`: fetch product details.
- `PUT /products/:id`: update name and slug.
- `PATCH /products/:id/disable`: set `is_active = 0` and `disabled_at = now`.
- `PATCH /products/:id/enable`: set `is_active = 1` and clear `disabled_at`.

Seller routes:

- `GET /products/:productId/sellers`: list all sellers for the product.
- `POST /products/:productId/sellers`: validate URL and insert seller.
- `PUT /products/:productId/sellers/:sellerId`: update current URL and active state if provided.
- `DELETE /products/:productId/sellers/:sellerId`: disable/remove from active use; prefer disable for historical integrity.
- `PATCH /products/:productId/sellers/:sellerId/disable` and `/enable`: explicit toggle endpoints.

Important: keep the route semantics consistent with the DB helper behavior. If the repo chooses soft-delete semantics, document it clearly in the route contract and do not silently delete rows from D1 for historical data.

Acceptance for step:

- The API can create, update, list, and disable products.
- The API can create, update, list, and disable sellers for a product.
- Duplicate seller URLs per product are rejected.

### 4) Add SQL/schema support if required

This milestone may not require schema changes beyond what Milestone 2 already implemented, but confirm the following constraints exist in the D1 schema:

- `products.is_active` as integer with allowed values `0` / `1`
- `sellers.product_id` foreign key to `products.id`
- `sellers.normalized_url` stored and unique per product
- `sellers.is_active` with default `1`
- `disabled_at` columns on both `products` and `sellers`

If the app currently lacks one of those constraints, add the minimal migration required and keep migration naming consistent.

Acceptance for step:

- The schema supports product enable/disable and seller dedupe without application workarounds.

### 5) Add regression coverage

Update the existing validation tests in `apps/api/src/db/validation.test.ts` and add any product/seller DB-level tests needed.

Test cases to include:

- valid product name and slug generation
- invalid empty product name
- valid seller URL normalization
- invalid seller URL rejection
- duplicate URL detection behavior for same product
- disabled product state stays persisted

Keep tests focused on actual logic and not on fake route mocks.

Acceptance for step:

- The validation and business rules are covered by tests.
- Changes in URL or product validation break the test suite before shipping.

## Verification Plan

Run the following checklist in order.

### A) Local DB and app setup

1. From the repo root, install dependencies if needed:
   ```bash
   pnpm install
   ```
2. Apply the local D1 migrations:
   ```bash
   cd apps/api
   pnpm db:apply
   ```
3. Start the local Worker:
   ```bash
   pnpm dev
   ```
4. Confirm the app boots and the DB binding resolves.

Pass criteria:

- The Worker starts without DB binding errors.
- `/db/health` returns JSON with a table list and a 200 response.

### B) Product API verification

Use HTTP requests against the local Worker.

1. Create a product:
   ```bash
   curl -X POST http://127.0.0.1:8787/products \
     -H 'Content-Type: application/json' \
     -d '{"name":"Bike"}'
   ```
2. List products:
   ```bash
   curl http://127.0.0.1:8787/products
   ```
3. Fetch the created product by ID.
4. Update the product name or slug.
5. Disable the product:
   ```bash
   curl -X PATCH http://127.0.0.1:8787/products/<product-id>/disable
   ```
6. Re-enable it and confirm the active flag toggles correctly.

Pass criteria:

- Create/list/get/update/disable/enable flows all return expected JSON.
- Product records are persisted to D1 and `is_active` reflects the toggle state.
- Disabled products are clearly marked and not treated as active by the app logic.

### C) Seller API verification

1. Create a seller for a known product:
   ```bash
   curl -X POST http://127.0.0.1:8787/products/<product-id>/sellers \
     -H 'Content-Type: application/json' \
     -d '{"url":"https://example.com/bike"}'
   ```
2. List sellers for that product.
3. Attempt a duplicate exact URL for the same product and confirm `409` or equivalent failure.
4. Update the seller URL and ensure the normalized value is recalculated.
5. Disable the seller and confirm it is no longer active.
6. Re-enable it and confirm the active state flips back.

Pass criteria:

- Seller add/list/update/disable flows all work.
- Duplicate exact URLs are rejected per product.
- Disabled sellers are stored with historical context, not silently lost.

### D) Validation and regression checks

Run:

```bash
cd apps/api
pnpm test
```

Also run the TypeScript build:

```bash
pnpm build
```

Pass criteria:

- Test suite passes.
- TypeScript compilation succeeds.
- No route or validation regression remains from the milestone changes.

## Definition of Done

Milestone 3 is complete when all of the following are true:

- Product CRUD API exists and works through HTTP.
- Seller CRUD API exists and works through HTTP for each product.
- Duplicate exact seller URLs are rejected per product.
- Product-level scraping toggle is persisted and readable.
- Additive route logic is centralized in the db layer and validation helpers.
- Local verification passes with real D1 data and actual HTTP requests.

## Implementation Notes for the Agent

- Prefer small, testable helper methods over large route blocks.
- Keep the route behavior simple and explicit; this app is not yet complex enough for heavy abstraction.
- Preserve historical seller and product rows when disabling them; do not delete data unnecessarily.
- Use the repo’s existing D1 patterns and validation helpers rather than introducing a new storage abstraction.
- If a route or edge case is ambiguous, favor the most conservative behavior: keep data, mark inactive, and return clear JSON errors.
