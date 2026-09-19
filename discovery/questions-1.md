# Top 10 Questions

1. What is the exact definition of a "product watcher" record: one logical product with many URLs, or one URL per watcher?
2. Should watchers be public/shared across all users, or private to the creator (with optional sharing)?
3. How should we handle product variants (size, color, model year) so we do not compare different items as the same product?
4. What is the expected behavior when a page cannot be scraped on a given day (blocked, CAPTCHA, layout change, timeout): retry policy, error state, and notification rules?
5. Which price should be tracked as canonical (list price, sale price, member price, coupon-applied price, shipping included/excluded, tax excluded/included)?
6. For "price dropped" notifications, should we compare against only the previous successful scrape, the last calendar day, or a rolling baseline, and should there be a minimum drop threshold?
7. Should subscribers control notification frequency and timing (instant, daily digest, weekly digest), and do we need quiet hours/time zone handling?
8. What anti-abuse and legal guardrails are required for scraping (robots.txt policy, site allowlist/denylist, per-domain rate limits, user-agent identification)?
9. Is Cloudflare R2 alone enough for querying chart/history data, or should we add a query-friendly store (for example D1) for time-series reads and sorting by lowest price?
10. What retention and lifecycle policy should apply to historical price data (keep forever, 12 months, configurable), and should disabled watchers preserve history or archive/delete it?
