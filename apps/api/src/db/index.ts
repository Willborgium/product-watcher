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

export async function createProduct(db: D1Database, input: ProductInput): Promise<ProductRow> {
  const validated = validateProductPayload(input);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const now = getNowIso();
  const slug = validated.value.slug;
  const result = await db
    .prepare(
      `
        INSERT INTO products (id, name, slug, is_active, created_at, updated_at, disabled_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
      `,
    )
    .bind(crypto.randomUUID(), validated.value.name, slug, normalizeBoolean(true), now, now)
    .run();

  return {
    id: String(result.meta.last_row_id ?? crypto.randomUUID()),
    name: validated.value.name,
    slug,
    is_active: 1,
    created_at: now,
    updated_at: now,
    disabled_at: null,
  };
}

export async function getProductById(db: D1Database, id: string): Promise<ProductRow | null> {
  const row = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
  return row ?? null;
}

export async function addSeller(db: D1Database, input: SellerInput): Promise<SellerRow> {
  const validation = validateSellerInput(input);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const now = getNowIso();
  const result = await db
    .prepare(
      `
        INSERT INTO sellers (id, product_id, url, normalized_url, is_active, created_at, updated_at, disabled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `,
    )
    .bind(crypto.randomUUID(), input.productId, input.url.trim(), validation.normalizedUrl, normalizeBoolean(true), now, now)
    .run();

  return {
    id: String(result.meta.last_row_id ?? crypto.randomUUID()),
    product_id: input.productId,
    url: input.url.trim(),
    normalized_url: validation.normalizedUrl,
    is_active: 1,
    created_at: now,
    updated_at: now,
    disabled_at: null,
  };
}

export async function getSellersForProduct(db: D1Database, productId: string): Promise<SellerRow[]> {
  const result = await db
    .prepare('SELECT * FROM sellers WHERE product_id = ? ORDER BY created_at ASC')
    .bind(productId)
    .all<SellerRow>();
  return result.results ?? [];
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
