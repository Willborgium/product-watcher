CREATE TABLE IF NOT EXISTS price_snapshots (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  price_cents INTEGER NULL,
  price_text TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  error_code TEXT NULL,
  error_message TEXT NULL,
  raw_response TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_seller_scraped
  ON price_snapshots (seller_id, scraped_at, status);
