CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  subscription_id TEXT NULL,
  seller_id TEXT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'duplicate_blocked')),
  price_cents INTEGER NULL,
  previous_price_cents INTEGER NULL,
  reason TEXT NOT NULL,
  error_message TEXT NULL,
  dedupe_key TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_product_sent
  ON notification_logs (product_id, sent_at, status, dedupe_key);
