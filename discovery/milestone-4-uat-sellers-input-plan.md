# Milestone 4 UAT: Sellers Input Plan

## Goal

Define the parsing strategy for the Milestone 4 seller-input UAT so the app can reliably extract product prices from a set of real retailer URLs without false positives and with a clear generic fallback path.

This plan is intentionally scoped to parsing semantics and abstraction layers only. The scraper flow, DB snapshot model, retry logic, and scheduler work were already implemented in [discovery/milestone-4-plan.md](discovery/milestone-4-plan.md), so this document focuses strictly on how price extraction should be structured and validated.

This plan is based on:

- the Milestone 4 parser requirements in [discovery/milestone-4-plan.md](discovery/milestone-4-plan.md)
- the Target false-positive findings in [discovery/milestone-4-uat-1-failures.md](discovery/milestone-4-uat-1-failures.md)
- the seller-input UAT checklist in [discovery/milestone-4-uat-sellers-input.md](discovery/milestone-4-uat-sellers-input.md)

## Scope

The parsing work must support the following seller URLs during UAT:

- Target
  - https://www.target.com/p/goldfish-colors-cheddar-cheese-crackers-27-3oz/-/A-88951127
- Walmart
  - https://www.walmart.com/ip/Goldfish-Cheddar-Cheese-Crackers-Baked-Snack-Crackers-1-oz-on-The-Go-Snack-Packs-20-Count-Box/253680066
- Amazon
  - https://www.amazon.com/Pepperidge-Farm-Goldfish-Cheddar-Ounce/dp/B079LJBZ6V
- Lowe's
  - https://www.lowes.com/pd/NeverKink-Teknor-Apex-Neverkink-Heavy-Duty-5-8IN100FT/5000141109
- Home Depot
  - https://www.homedepot.com/p/Gorilla-ToughLite-5-8-in-x-100-ft-Heavy-Duty-Garden-Hose-HYB55800/325990190
- Best Buy
  - https://www.bestbuy.com/product/corsair-galleon-100-sd-stream-deck-integrated-mechanical-gaming-keyboard-black/J39TSCSCRT/sku/6667833
- Newegg
  - https://www.newegg.com/redragon-k556-red-switch-black/p/32N-0003-001A8
- Tractor Supply
  - https://www.tractorsupply.com/tsc/product/groundwork-5-8-in-x-50-ft-mid-duty-garden-hose-400-psi-green-2579108

The work must include both:

- site-specific parsing when a public API or clear product page pattern exists
- a generic fallback parser for unknown or unsupported domains

## Requirements from the discovery docs

### Parser-oriented requirements

- Verify the app can parse prices from the listed site URLs.
- Prefer public APIs when they are available.
- If a site-specific parser fails, the generic fallback should still be attempted.
- Outcomes must be logged clearly with these states:
  - custom parsing succeeded
  - custom parsing failed, generic parsing succeeded
  - custom parsing failed, generic parsing failed
  - generic parsing succeeded
  - generic parsing failed
- The generic fallback must not allow obvious false positives such as ratings, dimensions, or shipping thresholds to be treated as product prices.

### Important design note

The Target UAT showed that a generic regex-only parser can produce false positives by reading values like ratings or product size instead of product price. The implementation should therefore treat the parser as a strategy layer rather than a single regex pass.

## Implementation plan

### 1) Define the parser contract

Create a clear abstraction for parsing logic so every seller can be handled through the same interface.

Recommended contract:

```ts
export interface PriceParseResult {
  ok: boolean;
  priceCents: number | null;
  priceText: string | null;
  source: "custom" | "generic" | "none";
  reason?: string;
}

export interface SellerPriceParser {
  domainMatch: RegExp;
  parse: (html: string, url: string) => PriceParseResult;
}
```

Responsibilities:

- parser returns a structured success/failure result
- parser must be pure and testable
- parser must not silently return a false positive
- parser should report whether it was custom or generic and why it failed

### 2) Add a parser registry by retailer domain

Add a small registry that resolves the parser based on hostname.

Supported parser domains should include at least:

- `target.com`
- `walmart.com`
- `amazon.com`
- `lowes.com`
- `homedepot.com`
- `bestbuy.com`
- `newegg.com`
- `tractorsupply.com`

Implementation shape:

```ts
const priceParsers: SellerPriceParser[] = [
  targetParser,
  walmartParser,
  amazonParser,
  lowesParser,
  homeDepotParser,
  bestBuyParser,
  newEggParser,
  tractorSupplyParser,
  genericParser,
];
```

Rules:

- first, try the site-specific parser that matches the hostname
- if that fails, fall back to the generic parser
- log all outcomes clearly and keep the final result deterministic

### 3) Prefer public API data when available

For each retailer, inspect whether a public product JSON or API endpoint exists and whether it exposes the live price.

Implementation work:

- prefer direct `api`/`JSON` data over scraping when the site exposes a stable product-price field
- if the public API is accessible without auth, use it as the first-choice source
- otherwise use a custom HTML parser for that domain
- if both API and HTML fail, fall through to generic parsing

Examples:

- Target: page HTML may include product info but also noisy values; prefer a data source if one is reliably discoverable
- Walmart / Amazon / Best Buy / Newegg / Tractor Supply may expose product JSON in embedded scripts or data attributes
- For some sites, the custom parser may be the only practical path without a public API

### 4) Build a site-specific parser matrix

For each seller domain, implement a parser that is tuned to that site’s markup and price signal.

#### Target parser

- Do not trust the first numeric value found in HTML.
- Ignore values in review/rating text and size labels like `27.3 oz`.
- Prefer values in price containers or visible product-price text.
- Penalize contexts including rating, stars, reviews, and units.
- Keep unit-test coverage against the Goldfish Target URL.

#### Walmart parser

- Look for product-price patterns in product JSON or explicit price text.
- Prefer the actual offer or final product price, not related metadata.

#### Amazon parser

- Use the canonical product price block and avoid match noise from review count, shipping, or rating values.
- Prefer final price text near known product price nodes.

#### Lowe's / Home Depot / Tractor Supply

- Parse product offer or list-price containers.
- Avoid picking product dimensions or technical metadata.

#### Best Buy / Newegg

- Prefer product price fields in structured product payloads or visible pricing modules.
- Not every retailer exposes the same markup; keep site-specific logic narrow and deterministic.

### 5) Implement a robust generic fallback parser

The fallback parser must be much safer than the initial regex-only pass.

Recommended rules:

- search for currency-like patterns with a clear price shape
- reject obviously non-price signals such as ratings, sizes, counts, review scores, temperature, weight, and shipping threshold text
- prefer values near product-price keywords such as `price`, `sale`, `now`, `each`, `total`, and `current price`
- reject values with unit context like `oz`, `lb`, `in`, `ft`, `stars`, `rating`, `reviews`
- normalize the value to integer cents

The generic parser should act as a safety net, not as the main source of truth for domains with known custom rules.

### 6) Add structured outcome logging

Every scrape attempt should log a clear outcome path.

Required states:

- `custom parsing succeeded`
- `custom parsing failed, generic parsing succeeded`
- `custom parsing failed, generic parsing failed`
- `generic parsing succeeded`
- `generic parsing failed`

Recommended implementation:

```ts
const parseOutcome = {
  customSucceeded: false,
  customFailed: false,
  genericSucceeded: false,
  genericFailed: false,
};
```

Then map it to a final log message, for example:

```ts
log.info("seller.parse.outcome", {
  sellerId,
  url,
  outcome: "custom parsing failed, generic parsing succeeded",
  customReason,
  genericReason,
  priceCents,
  priceText,
});
```

This should be persisted in the raw scrape result or a structured log so future debugging does not rely on ad hoc terminal output.

### 7) Keep parser semantics isolated from storage and scheduling concerns

The parser abstraction should live entirely at the parsing layer and avoid coupling to DB persistence, scheduling, or endpoint transport concerns.

Implementation approach:

1. receive the fetched HTML payload from the caller
2. resolve the appropriate parser strategy for the domain
3. attempt the custom parser first, then the generic fallback if needed
4. return a structured result containing:
   - success/failure status
   - cents value when available
   - human-readable price text when available
   - parser source (`custom` or `generic`)
   - failure reasoning or confidence signal
5. leave persistence and scheduling to the already-implemented scraper wrapper

This keeps the new work strictly focused on parser semantics and abstraction without revisiting the Milestone 4 job pipeline.

### 8) Add regression tests before implementing the fix

Follow a red-to-green flow for the UAT cases.

Add tests for:

- Target Goldfish page returns `$3.29` and not `4.77`
- Walmart product page returns a price and not metadata values
- Amazon returns a valid price from the canonical product block
- Lowe's/Home Depot/Tractor Supply parse a real offers price
- Unsupported domains still fall back to generic parsing
- Failure cases log the correct outcome label

Recommended file locations:

- [apps/api/src/scraper.test.ts](apps/api/src/scraper.test.ts)
- any new parser-focused tests under `apps/api/src/`

### 9) Verification checklist

The parsing work is ready when all of the following are true:

- all listed seller URLs can be parsed successfully or fail with a clear, logged reason
- no false-positive `4.77` or `27.3` value is accepted as a product price
- the generic parser is used only as a fallback after custom parser failure
- the parser returns consistent `source` / `reason` metadata for debugging
- the unit tests pass for the custom and generic parsing branches

## Suggested execution order

1. Add the parser contract and registry.
2. Write failing regression tests for Target and one or two other retailers.
3. Implement the custom parser for Target first, because it already exposed the false-positive issue.
4. Add generic fallback logic with stricter heuristics.
5. Add the other site-specific parsers.
6. Add structured outcome logging and run the parser-focused test set.
7. Validate the live UAT URLs against the parser logic only.

## Definition of done for this UAT workstream

This feature set is complete when the parser layer can process the seller-input URL set with a clear, deterministic price extraction pipeline and logs all parse outcomes in a way that makes debugging and future milestone work straightforward, without revisiting the already-implemented scheduler or storage flow.
