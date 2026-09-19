CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  unsubscribed_at TEXT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_product_email
  ON subscriptions (product_id, normalized_email);

CREATE INDEX IF NOT EXISTS idx_subscriptions_product_active_email
  ON subscriptions (product_id, is_active, normalized_email);
