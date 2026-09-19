CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_product_normalized_url
  ON sellers (product_id, normalized_url);

CREATE INDEX IF NOT EXISTS idx_sellers_product_status
  ON sellers (product_id, is_active, normalized_url);
