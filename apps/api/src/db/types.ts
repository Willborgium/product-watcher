export type ProductStatus = 'active' | 'inactive';

export type PriceSnapshotStatus = 'success' | 'failure';

export type NotificationStatus = 'sent' | 'failed' | 'skipped' | 'duplicate_blocked';

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

export interface SellerRow {
  id: string;
  product_id: string;
  url: string;
  normalized_url: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

export interface PriceSnapshotRow {
  id: string;
  seller_id: string;
  scraped_at: string;
  price_cents: number | null;
  price_text: string | null;
  status: PriceSnapshotStatus;
  error_code: string | null;
  error_message: string | null;
  raw_response: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  product_id: string;
  email: string;
  normalized_email: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  unsubscribed_at: string | null;
}

export interface NotificationLogRow {
  id: string;
  product_id: string;
  subscription_id: string | null;
  seller_id: string | null;
  sent_at: string;
  status: NotificationStatus;
  price_cents: number | null;
  previous_price_cents: number | null;
  reason: string;
  error_message: string | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface ProductInput {
  name: string;
  slug?: string;
  isActive?: boolean;
}

export interface SellerInput {
  productId: string;
  url: string;
  isActive?: boolean;
}

export interface PriceSnapshotInput {
  sellerId: string;
  scrapedAt: string;
  priceCents?: number | null;
  priceText?: string | null;
  status: PriceSnapshotStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  rawResponse?: string | null;
}

export interface SubscriptionInput {
  productId: string;
  email: string;
  isActive?: boolean;
}

export interface NotificationLogInput {
  productId: string;
  subscriptionId?: string | null;
  sellerId?: string | null;
  sentAt: string;
  status: NotificationStatus;
  priceCents?: number | null;
  previousPriceCents?: number | null;
  reason: string;
  errorMessage?: string | null;
  dedupeKey?: string | null;
}
