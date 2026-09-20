import type { D1Database } from '@cloudflare/workers-types';
import type {
  NotificationLogInput,
  NotificationLogRow,
  PriceSnapshotInput,
  PriceSnapshotRow,
  ProductInput,
  ProductRow,
  SellerInput,
  SellerRow,
  SubscriptionInput,
  SubscriptionRow,
} from './types';
import {
  detectDuplicateSellerUrl,
  slugify,
  validateNotificationLog,
  validatePriceSnapshot,
  validateProductPayload,
  validateSellerInput,
  validateSubscriptionInput,
} from './validation';

export type EnvironmentWithDb = {
  DB: D1Database;
};

export function getNowIso(): string {
  return new Date().toISOString();
}

function normalizeBoolean(value: boolean | undefined): 0 | 1 {
  return value === false ? 0 : 1;
}

export async function listProducts(db: D1Database): Promise<ProductRow[]> {
  const result = await db.prepare('SELECT * FROM products ORDER BY created_at DESC, name ASC').all<ProductRow>();
  return result.results ?? [];
}

export async function createProduct(db: D1Database, input: ProductInput): Promise<ProductRow> {
  const validated = validateProductPayload(input);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const isActive = input.isActive ?? true;
  const now = getNowIso();
  const result = await db
    .prepare(
      `
        INSERT INTO products (id, name, slug, is_active, created_at, updated_at, disabled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(crypto.randomUUID(), validated.value.name, validated.value.slug, normalizeBoolean(isActive), now, now, isActive ? null : now)
    .run();

  return {
    id: String(result.meta.last_row_id ?? crypto.randomUUID()),
    name: validated.value.name,
    slug: validated.value.slug,
    is_active: normalizeBoolean(isActive),
    created_at: now,
    updated_at: now,
    disabled_at: isActive ? null : now,
  };
}

export async function getProductById(db: D1Database, id: string): Promise<ProductRow | null> {
  const row = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
  return row ?? null;
}

export async function listActiveProducts(db: D1Database): Promise<ProductRow[]> {
  const result = await db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at ASC').all<ProductRow>();
  return result.results ?? [];
}

export async function updateProduct(db: D1Database, id: string, patch: Partial<ProductInput>): Promise<ProductRow> {
  const existing = await getProductById(db, id);
  if (!existing) {
    throw new Error('Product not found.');
  }

  const nextName = patch.name?.trim() ?? existing.name;
  const nextSlug = patch.slug?.trim() || (patch.name?.trim() ? slugify(nextName) : existing.slug);
  const nextIsActive = patch.isActive ?? existing.is_active === 1;
  const validated = validateProductPayload({ name: nextName, slug: nextSlug });
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const now = getNowIso();
  await db
    .prepare(
      `
        UPDATE products
        SET name = ?, slug = ?, is_active = ?, updated_at = ?, disabled_at = ?
        WHERE id = ?
      `,
    )
    .bind(validated.value.name, validated.value.slug, normalizeBoolean(nextIsActive), now, nextIsActive ? null : now, id)
    .run();

  return {
    ...existing,
    name: validated.value.name,
    slug: validated.value.slug,
    is_active: normalizeBoolean(nextIsActive),
    updated_at: now,
    disabled_at: nextIsActive ? null : now,
  };
}

export async function setProductActiveState(db: D1Database, id: string, isActive: boolean): Promise<ProductRow> {
  const current = await getProductById(db, id);
  if (!current) {
    throw new Error('Product not found.');
  }

  return updateProduct(db, id, { name: current.name, slug: current.slug, isActive });
}

export async function addSeller(db: D1Database, input: SellerInput): Promise<SellerRow> {
  return createSeller(db, input);
}

export async function createSeller(db: D1Database, input: SellerInput): Promise<SellerRow> {
  const validation = validateSellerInput(input);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const product = await getProductById(db, input.productId);
  if (!product) {
    throw new Error('Product not found.');
  }

  const existing = await listSellersForProduct(db, input.productId);
  if (detectDuplicateSellerUrl(validation.normalizedUrl, existing.map((seller) => seller.normalized_url))) {
    throw new Error('Seller URL already exists for this product.');
  }

  const isActive = input.isActive ?? true;
  const now = getNowIso();
  const result = await db
    .prepare(
      `
        INSERT INTO sellers (id, product_id, url, normalized_url, is_active, created_at, updated_at, disabled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `,
    )
    .bind(
      crypto.randomUUID(),
      input.productId,
      input.url.trim(),
      validation.normalizedUrl,
      normalizeBoolean(isActive),
      now,
      now,
      isActive ? null : now,
    )
    .run();

  return {
    id: String(result.meta.last_row_id ?? crypto.randomUUID()),
    product_id: input.productId,
    url: input.url.trim(),
    normalized_url: validation.normalizedUrl,
    is_active: normalizeBoolean(isActive),
    created_at: now,
    updated_at: now,
    disabled_at: isActive ? null : now,
  };
}

export async function listSellersForProduct(db: D1Database, productId: string): Promise<SellerRow[]> {
  const result = await db
    .prepare('SELECT * FROM sellers WHERE product_id = ? ORDER BY created_at ASC')
    .bind(productId)
    .all<SellerRow>();
  return result.results ?? [];
}

export async function getSellerById(db: D1Database, id: string): Promise<SellerRow | null> {
  const row = await db.prepare('SELECT * FROM sellers WHERE id = ?').bind(id).first<SellerRow>();
  return row ?? null;
}

export async function listActiveSellersForProduct(db: D1Database, productId: string): Promise<SellerRow[]> {
  const result = await db
    .prepare('SELECT * FROM sellers WHERE product_id = ? AND is_active = 1 ORDER BY created_at ASC')
    .bind(productId)
    .all<SellerRow>();
  return result.results ?? [];
}

export async function listActiveSellersForScrape(db: D1Database): Promise<SellerRow[]> {
  const result = await db
    .prepare(
      `
        SELECT s.*
        FROM sellers s
        INNER JOIN products p ON p.id = s.product_id
        WHERE s.is_active = 1 AND p.is_active = 1
        ORDER BY s.created_at ASC
      `,
    )
    .all<SellerRow>();
  return result.results ?? [];
}

export async function getLatestSuccessfulPriceSnapshot(db: D1Database, sellerId: string): Promise<PriceSnapshotRow | null> {
  const row = await db
    .prepare(
      'SELECT * FROM price_snapshots WHERE seller_id = ? AND status = ? ORDER BY scraped_at DESC, created_at DESC LIMIT 1',
    )
    .bind(sellerId, 'success')
    .first<PriceSnapshotRow>();
  return row ?? null;
}

export async function updateSeller(db: D1Database, id: string, patch: Partial<SellerInput>): Promise<SellerRow> {
  const existing = await getSellerById(db, id);
  if (!existing) {
    throw new Error('Seller not found.');
  }

  const nextProductId = patch.productId ?? existing.product_id;
  const nextUrl = patch.url ? patch.url.trim() : existing.url;
  const nextIsActive = patch.isActive ?? existing.is_active === 1;

  const validation = validateSellerInput({ productId: nextProductId, url: nextUrl });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const product = await getProductById(db, nextProductId);
  if (!product) {
    throw new Error('Product not found.');
  }

  const duplicates = await listSellersForProduct(db, nextProductId);
  const duplicateMatch = duplicates.filter((seller) => seller.id !== id).some((seller) =>
    detectDuplicateSellerUrl(validation.normalizedUrl, [seller.normalized_url]),
  );
  if (duplicateMatch) {
    throw new Error('Seller URL already exists for this product.');
  }

  const now = getNowIso();
  await db
    .prepare(
      `
        UPDATE sellers
        SET product_id = ?, url = ?, normalized_url = ?, is_active = ?, updated_at = ?, disabled_at = ?
        WHERE id = ?
      `,
    )
    .bind(
      nextProductId,
      nextUrl,
      validation.normalizedUrl,
      normalizeBoolean(nextIsActive),
      now,
      nextIsActive ? null : now,
      id,
    )
    .run();

  return {
    ...existing,
    product_id: nextProductId,
    url: nextUrl,
    normalized_url: validation.normalizedUrl,
    is_active: normalizeBoolean(nextIsActive),
    updated_at: now,
    disabled_at: nextIsActive ? null : now,
  };
}

export async function setSellerActiveState(db: D1Database, id: string, isActive: boolean): Promise<SellerRow> {
  const current = await getSellerById(db, id);
  if (!current) {
    throw new Error('Seller not found.');
  }

  const updated = await updateSeller(db, id, {
    productId: current.product_id,
    url: current.url,
    isActive,
  });

  return updated;
}

export async function disableSeller(db: D1Database, id: string): Promise<SellerRow> {
  return setSellerActiveState(db, id, false);
}

export async function deleteSeller(db: D1Database, id: string): Promise<SellerRow> {
  return disableSeller(db, id);
}

export async function createPriceSnapshot(db: D1Database, input: PriceSnapshotInput): Promise<PriceSnapshotRow> {
  const validation = validatePriceSnapshot(input);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const now = getNowIso();
  const row = await db
    .prepare(
      `
        INSERT INTO price_snapshots (
          id, seller_id, scraped_at, price_cents, price_text, status, error_code, error_message, raw_response, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      input.sellerId,
      input.scrapedAt,
      input.priceCents ?? null,
      input.priceText ?? null,
      input.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.rawResponse ?? null,
      now,
    )
    .run();

  return {
    id: String(row.meta.last_row_id ?? crypto.randomUUID()),
    seller_id: input.sellerId,
    scraped_at: input.scrapedAt,
    price_cents: input.priceCents ?? null,
    price_text: input.priceText ?? null,
    status: input.status,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    raw_response: input.rawResponse ?? null,
    created_at: now,
  };
}

export async function getRecentSnapshotsForSeller(db: D1Database, sellerId: string, limit = 30): Promise<PriceSnapshotRow[]> {
  const result = await db
    .prepare('SELECT * FROM price_snapshots WHERE seller_id = ? ORDER BY scraped_at DESC, created_at DESC LIMIT ?')
    .bind(sellerId, limit)
    .all<PriceSnapshotRow>();
  return result.results ?? [];
}

export async function createSubscription(db: D1Database, input: SubscriptionInput): Promise<SubscriptionRow> {
  const validation = validateSubscriptionInput(input);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const now = getNowIso();
  const result = await db
    .prepare(
      `
        INSERT INTO subscriptions (
          id, product_id, email, normalized_email, is_active, created_at, updated_at, unsubscribed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `,
    )
    .bind(
      crypto.randomUUID(),
      input.productId,
      input.email.trim(),
      validation.normalizedEmail,
      normalizeBoolean(true),
      now,
      now,
    )
    .run();

  return {
    id: String(result.meta.last_row_id ?? crypto.randomUUID()),
    product_id: input.productId,
    email: input.email.trim(),
    normalized_email: validation.normalizedEmail,
    is_active: 1,
    created_at: now,
    updated_at: now,
    unsubscribed_at: null,
  };
}

export async function getActiveSubscriptionsForProduct(db: D1Database, productId: string): Promise<SubscriptionRow[]> {
  const result = await db
    .prepare('SELECT * FROM subscriptions WHERE product_id = ? AND is_active = 1 ORDER BY created_at ASC')
    .bind(productId)
    .all<SubscriptionRow>();
  return result.results ?? [];
}

export async function addNotificationLog(db: D1Database, input: NotificationLogInput): Promise<NotificationLogRow> {
  const validation = validateNotificationLog(input);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const now = getNowIso();
  const result = await db
    .prepare(
      `
        INSERT INTO notification_logs (
          id, product_id, subscription_id, seller_id, sent_at, status, price_cents, previous_price_cents, reason,
          error_message, dedupe_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      input.productId,
      input.subscriptionId ?? null,
      input.sellerId ?? null,
      input.sentAt,
      input.status,
      input.priceCents ?? null,
      input.previousPriceCents ?? null,
      input.reason.trim(),
      input.errorMessage ?? null,
      input.dedupeKey ?? null,
      now,
    )
    .run();

  return {
    id: String(result.meta.last_row_id ?? crypto.randomUUID()),
    product_id: input.productId,
    subscription_id: input.subscriptionId ?? null,
    seller_id: input.sellerId ?? null,
    sent_at: input.sentAt,
    status: input.status,
    price_cents: input.priceCents ?? null,
    previous_price_cents: input.previousPriceCents ?? null,
    reason: input.reason.trim(),
    error_message: input.errorMessage ?? null,
    dedupe_key: input.dedupeKey ?? null,
    created_at: now,
  };
}

export async function migrationStatus(db: D1Database): Promise<Record<string, unknown>> {
  const tables = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all<{ name: string }>();
  return {
    tables: tables.results?.map((row: { name: string }) => row.name) ?? [],
    count: tables.results?.length ?? 0,
  };
}
