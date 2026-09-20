# Milestone 4 UAT 1 Failures

## Date

2026-09-19

## Test target

URL: https://www.target.com/p/goldfish-colors-cheddar-cheese-crackers-27-3oz/-/A-88951127

## Summary

The live Target scrape verification failed. The scraper returned a valid-looking price, but it was the wrong one. Instead of the product price of $3.29, it captured the rating value of 4.77 as the parsed price candidate.

## Verification command run

```bash
cd /c/source/product-watcher/apps/api && pnpm vitest run src/scraper.test.ts
```

## Evidence from the failing test

```text
 FAIL  src/scraper.test.ts > scraper helpers > scrapes the live Target product price for Goldfish crackers
AssertionError: expected 477 to be 329 // Object.is equality

- Expected
+ Received

- 329
+ 477
```

The test expects:

- `329` cents = `$3.29`

The scraper returned:

- `477` cents = `$4.77`

That value matches the product rating text (`4.77 out of 5 stars`) rather than the product price.

## Root cause

The current parser in `apps/api/src/scraper.ts` uses a generic regex-based price extractor over the HTML text. Target's product page contains multiple numeric values that are not the product price, including:

- size information like `27.3 oz`
- rating information like `4.77 out of 5 stars`
- shipping threshold copy like `$35 orders`

The regex finds the first valid-looking monetary value in the rendered HTML content and treats it as the product price. On this page, the first high-confidence numeric candidate is the rating value, not the retail price.

## Why this matters

This means the milestone 4 scraper is not yet verified to work for Target URLs with mixed numeric content in the page source. A generic parser is too brittle for a retailer page like Target that embeds both product metadata and review values in the same HTML payload.

## Observed behavior

The current scraper result for the live URL was:

- status: `success`
- `priceCents`: `477`
- `priceText`: `$4.77`

This is a false positive. It does not match the actual product offer on the page.

## Required follow-up

The next fix should avoid blindly choosing the first valid currency match. It should prefer values that are likely to be product pricing by using one or more of the following heuristics:

1. Prefer values in a product-price container or price module context.
2. Penalize values near review/rating text or size/weight text like `oz`, `lb`, `stars`, `rating`.
3. Prefer match text that appears near product-price keywords like `price`, `now`, `sale`, `only`, `each`, or price module labels.
4. If Target exposes product data through structured JSON or a known API payload, prefer that data source over free-form HTML regex scanning.

## Status

UAT 1 for the Target Goldfish URL is currently failing. This is a documented blocker for milestone 4 acceptance for this live product page.
