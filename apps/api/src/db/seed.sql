INSERT INTO products (id, name, slug, is_active, created_at, updated_at, disabled_at)
VALUES ('prod-bike', 'Bike', 'bike', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', NULL);

INSERT INTO sellers (id, product_id, url, normalized_url, is_active, created_at, updated_at, disabled_at)
VALUES
  ('seller-bike-1', 'prod-bike', 'https://bike-world.example/bike', 'https://bike-world.example/bike', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', NULL),
  ('seller-bike-2', 'prod-bike', 'https://cycling-supplies.example/bike', 'https://cycling-supplies.example/bike', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', NULL);

INSERT INTO price_snapshots (id, seller_id, scraped_at, price_cents, price_text, status, error_code, error_message, raw_response, created_at)
VALUES
  ('snap-bike-1', 'seller-bike-1', '2026-09-01T08:00:00.000Z', 99999, '$999.99', 'success', NULL, NULL, '{"price":"999.99"}', '2026-09-01T08:00:00.000Z'),
  ('snap-bike-2', 'seller-bike-1', '2026-09-02T08:00:00.000Z', NULL, NULL, 'failure', 'timeout', 'Request timed out', '{"error":"timeout"}', '2026-09-02T08:00:00.000Z'),
  ('snap-bike-3', 'seller-bike-2', '2026-09-03T08:00:00.000Z', 109999, '$1,099.99', 'success', NULL, NULL, '{"price":"1099.99"}', '2026-09-03T08:00:00.000Z');

INSERT INTO subscriptions (id, product_id, email, normalized_email, is_active, created_at, updated_at, unsubscribed_at)
VALUES ('sub-bike-1', 'prod-bike', 'alerts@example.com', 'alerts@example.com', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', NULL);

INSERT INTO notification_logs (id, product_id, subscription_id, seller_id, sent_at, status, price_cents, previous_price_cents, reason, error_message, dedupe_key, created_at)
VALUES ('log-bike-1', 'prod-bike', 'sub-bike-1', 'seller-bike-2', '2026-09-03T12:00:00.000Z', 'sent', 109999, 99999, 'Price drop detected', NULL, 'product-bike-2026-09-03', '2026-09-03T12:00:00.000Z');
