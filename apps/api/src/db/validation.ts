export type ValidationResult<T = void> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('URL is required');
  }

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error('Invalid URL');
  }
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'product';
}

export function detectDuplicateSellerUrl(candidateUrl: string, existingUrls: Array<string | null | undefined>): boolean {
  if (!candidateUrl || !candidateUrl.trim()) {
    return false;
  }

  const normalizedCandidate = normalizeUrl(candidateUrl).toLowerCase();
  return existingUrls.some((existingUrl) => {
    if (!existingUrl || !existingUrl.trim()) {
      return false;
    }

    return normalizeUrl(existingUrl).toLowerCase() === normalizedCandidate;
  });
}

export function validateProductPayload(payload: { name?: string; slug?: string }) {
  const name = payload.name?.trim();
  if (!name) {
    return { ok: false as const, error: 'Product name is required.' };
  }

  const slug = (payload.slug ?? slugify(name)).trim() || slugify(name);

  return {
    ok: true as const,
    value: {
      name,
      slug,
    },
  };
}

export function validateSellerInput(payload: { productId?: string; url?: string }) {
  if (!payload.productId || !payload.productId.trim()) {
    return { ok: false as const, error: 'Seller productId is required.' };
  }

  if (!payload.url || !payload.url.trim()) {
    return { ok: false as const, error: 'Seller URL is required.' };
  }

  try {
    const normalizedUrl = normalizeUrl(payload.url);
    return { ok: true as const, normalizedUrl };
  } catch {
    return { ok: false as const, error: 'Seller URL must be a valid URL.' };
  }
}

export function validateSubscriptionInput(payload: { productId?: string; email?: string }) {
  if (!payload.productId || !payload.productId.trim()) {
    return { ok: false as const, error: 'Subscription productId is required.' };
  }

  if (!payload.email || !isValidEmail(payload.email)) {
    return { ok: false as const, error: 'Subscription email must be a valid email address.' };
  }

  return { ok: true as const, normalizedEmail: payload.email.trim().toLowerCase() };
}

export function validatePriceSnapshot(payload: {
  sellerId?: string;
  scrapedAt?: string;
  priceCents?: number | null;
  priceText?: string | null;
  status?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  if (!payload.sellerId || !payload.sellerId.trim()) {
    return { ok: false as const, error: 'Price snapshot sellerId is required.' };
  }

  if (!payload.scrapedAt || !payload.scrapedAt.trim()) {
    return { ok: false as const, error: 'Price snapshot scrapedAt is required.' };
  }

  const status = payload.status ?? 'success';
  if (status !== 'success' && status !== 'failure') {
    return { ok: false as const, error: 'Price snapshot status must be success or failure.' };
  }

  const hasPrice = payload.priceCents !== undefined && payload.priceCents !== null && Number.isFinite(payload.priceCents);
  const hasFailureReason = Boolean((payload.errorCode ?? payload.errorMessage)?.trim());

  if (status === 'success' && !hasPrice) {
    return { ok: false as const, error: 'Successful price snapshots must include a price.' };
  }

  if (status === 'failure' && !hasPrice && !hasFailureReason) {
    return { ok: false as const, error: 'Failed price snapshots must include error metadata.' };
  }

  return { ok: true as const };
}

export function validateNotificationLog(payload: {
  productId?: string;
  status?: string;
  reason?: string;
}) {
  if (!payload.productId || !payload.productId.trim()) {
    return { ok: false as const, error: 'Notification log productId is required.' };
  }

  const validStatuses = ['sent', 'failed', 'skipped', 'duplicate_blocked'];
  if (!payload.status || !validStatuses.includes(payload.status)) {
    return { ok: false as const, error: 'Notification log status is invalid.' };
  }

  if (!payload.reason || !payload.reason.trim()) {
    return { ok: false as const, error: 'Notification log reason is required.' };
  }

  return { ok: true as const };
}
