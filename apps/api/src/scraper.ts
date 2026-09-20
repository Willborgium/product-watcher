import type { D1Database } from '@cloudflare/workers-types';
import { createPriceSnapshot, getNowIso, listActiveSellersForScrape } from './db';

export type ScrapeErrorCode = 'timeout' | 'network_error' | 'rate_limited' | 'parse_error' | 'blocked_page' | 'unexpected_error';

export type ScrapeStatus = 'success' | 'failure';

export interface ScrapeResult {
  sellerId?: string;
  status: ScrapeStatus;
  priceCents: number | null;
  priceText: string | null;
  errorCode: ScrapeErrorCode | null;
  errorMessage: string | null;
  rawResponse: string | null;
}

export interface SellerCandidate {
  id: string;
  product_id: string;
  url: string;
  is_active: number;
}

function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

export function normalizeMoneyString(value: string): number | null {
  const source = String(value ?? '').trim();
  if (!source) {
    return null;
  }

  const matches = source.match(/[-+]?\d[\d.,\s]*\d/);
  if (!matches) {
    return null;
  }

  let candidate = matches[0].replace(/\s+/g, '');
  if (!candidate || !/[\d]/.test(candidate)) {
    return null;
  }

  const hasComma = candidate.includes(',');
  const hasDot = candidate.includes('.');

  if (hasComma && hasDot) {
    const lastComma = candidate.lastIndexOf(',');
    const lastDot = candidate.lastIndexOf('.');
    const decimalDelimiter = lastComma > lastDot ? ',' : '.';
    const [integral, fractional] = candidate.split(decimalDelimiter);
    const integerPart = integral.replace(/[.,]/g, '');
    const fractionPart = (fractional ?? '').replace(/[.,]/g, '');
    if (!integerPart || !fractionPart) {
      return null;
    }
    const numeric = Number(`${integerPart}.${fractionPart}`);
    return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
  }

  if (hasComma) {
    const parts = candidate.split(',');
    if (parts.length > 2) {
      const whole = Number(parts.join(''));
      return Number.isFinite(whole) ? Math.round(whole) : null;
    }

    const digitsAfterSeparator = parts[1]?.length ?? 0;
    if (digitsAfterSeparator <= 2) {
      const numeric = Number(parts.join('.'));
      return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
    }

    const numeric = Number(parts.join(''));
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  }

  if (hasDot) {
    const parts = candidate.split('.');
    if (parts.length > 2) {
      const whole = Number(parts.join(''));
      return Number.isFinite(whole) ? Math.round(whole) : null;
    }

    const digitsAfterSeparator = parts[1]?.length ?? 0;
    if (digitsAfterSeparator <= 2) {
      const numeric = Number(candidate);
      return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
    }

    const numeric = Number(parts.join(''));
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  }

  const numeric = Number(candidate);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

export function findBestPriceMatch(html: string): string | null {
  const text = stripHtml(html ?? '');
  const matches = Array.from(text.matchAll(/(?:\$|€|£|¥)?\s*[-+]?\d[\d\s.,]*\d\s*(?:\$|€|£|¥)?/gi));

  let bestMatch: { value: string; score: number } | null = null;

  for (const match of matches) {
    const rawValue = (match[0] ?? '').trim();
    if (!rawValue) {
      continue;
    }

    const normalized = rawValue.replace(/\s+/g, '');
    const cents = normalizeMoneyString(normalized);
    if (cents === null) {
      continue;
    }

    const start = Math.max(0, (match.index ?? 0) - 60);
    const end = Math.min(text.length, (match.index ?? 0) + rawValue.length + 60);
    const context = text.slice(start, end);

    let score = 0;
    if (/[\$€£¥]/.test(rawValue)) {
      score += 25;
    }
    if (/\d[.,]\d{2}/.test(normalized)) {
      score += 30;
    }
    if (/\b(?:price|sale|now|only|each|cost|total|item)\b/i.test(context)) {
      score += 25;
    }
    if (/\b(?:oz|lb|lbs|in|cm|ml|kg|g)\b/i.test(context)) {
      score -= 60;
    }
    if (cents > 100000 || cents < 1) {
      score -= 20;
    }
    if (score > (bestMatch?.score ?? -Infinity)) {
      bestMatch = { value: rawValue, score };
    }
  }

  return bestMatch?.value ?? null;
}

export function parsePriceFromHtml(html: string): number | null {
  const bestMatch = findBestPriceMatch(html);
  return bestMatch ? normalizeMoneyString(bestMatch.replace(/\s+/g, '')) : null;
}

export function classifyScrapeError(error: unknown): ScrapeErrorCode {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected scrape error';
  const text = rawMessage.toLowerCase();

  if (/timeout|abort|timed out/i.test(text)) {
    return 'timeout';
  }
  if (/rate limit|too many requests|blocked|captcha|403|robots|bot/i.test(text)) {
    return 'blocked_page';
  }
  if (/parse/i.test(text)) {
    return 'parse_error';
  }
  if (/failed to fetch|network|dns|fetch|connection|unreachable|offline/i.test(text)) {
    return 'network_error';
  }

  return 'unexpected_error';
}

export function listScrapeCandidates(
  rows: Array<{
    id: string;
    product_id?: string | null;
    productId?: string | null;
    url?: string | null;
    is_active?: number | string | boolean;
    product_is_active?: number | string | boolean;
  }>,
): SellerCandidate[] {
  const rawRows = Array.isArray(rows) ? rows : (rows as any)?.results ?? [];

  const activeProductIds = new Set(
    rawRows
      .filter((row: any) => !!row && !row.url && !!row.id && Number(row.is_active ?? 1) === 1)
      .map((row: any) => row.id),
  );

  return rawRows
    .filter((row: any) => {
      if (!row || !row.id || !row.url || Number(row.is_active ?? 1) !== 1) {
        return false;
      }

      const productId = row.product_id ?? row.productId ?? null;
      if (!productId) {
        return false;
      }

      const productLooksActive = activeProductIds.has(productId) || Number(row.product_is_active ?? 1) === 1;
      return productLooksActive;
    })
    .map((row: any) => ({
      id: row.id,
      product_id: row.product_id ?? row.productId ?? '',
      url: row.url ?? '',
      is_active: Number(row.is_active ?? 1),
    }));
}

export async function scrapeSellerPrice(
  url: string,
  attemptLimit = 2,
  timeoutMs = 10000,
  fetcher: typeof fetch | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response | string>) = fetch,
): Promise<ScrapeResult> {
  const safeLimit = Math.max(1, Number(attemptLimit) || 1);
  const safeTimeout = Math.max(1000, Number(timeoutMs) || 10000);

  let lastError: unknown = null;
  let lastHtml: string | null = null;

  for (let attempt = 1; attempt <= safeLimit; attempt += 1) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(safeTimeout) });
      const html = typeof response === 'string' ? response : await response.text();
      lastHtml = html;

      const cents = parsePriceFromHtml(html);
      if (cents !== null) {
        const priceTextMatch = findBestPriceMatch(html) ?? String(cents / 100);
        return {
          status: 'success',
          priceCents: cents,
          priceText: priceTextMatch.trim(),
          errorCode: null,
          errorMessage: null,
          rawResponse: html.slice(0, 20000),
        };
      }

      lastError = new Error('parse_error');
    } catch (error) {
      lastError = error;
      lastHtml = null;
    }

    if (attempt < safeLimit) {
      continue;
    }
  }

  const errorCode = classifyScrapeError(lastError ?? new Error('unexpected_error'));
  const errorMessage = lastError instanceof Error ? lastError.message : 'Scrape failed.';

  return {
    status: 'failure',
    priceCents: null,
    priceText: null,
    errorCode,
    errorMessage: errorMessage || 'Scrape failed.',
    rawResponse: lastHtml ?? JSON.stringify({ error: errorMessage, code: errorCode }, null, 2),
  };
}

export async function recordSnapshotForSeller(
  db: D1Database,
  input: {
    sellerId: string;
    scrapedAt: string;
    priceCents?: number | null;
    priceText?: string | null;
    status: 'success' | 'failure';
    errorCode?: string | null;
    errorMessage?: string | null;
    rawResponse?: string | null;
  },
) {
  return createPriceSnapshot(db, {
    sellerId: input.sellerId,
    scrapedAt: input.scrapedAt,
    priceCents: input.priceCents ?? null,
    priceText: input.priceText ?? null,
    status: input.status,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    rawResponse: input.rawResponse ?? null,
  });
}

export async function runDailyScrape(
  db: D1Database,
  candidateLoader: (db: D1Database) => Promise<Array<{ id: string; product_id: string; url: string; is_active: number }> | { results: Array<{ id: string; product_id: string; url: string; is_active: number }> }> = listActiveSellersForScrape,
  fetcher: typeof fetch = fetch,
  now = getNowIso(),
): Promise<Array<{ id: string; sellerId: string; status: 'success' | 'failure'; priceCents: number | null; priceText: string | null; errorCode: string | null; errorMessage: string | null; rawResponse: string | null }>> {
  const rows = await candidateLoader(db);
  const candidates = listScrapeCandidates(Array.isArray(rows) ? rows : (rows as any)?.results ?? []);

  const snapshots: Array<{ id: string; sellerId: string; status: 'success' | 'failure'; priceCents: number | null; priceText: string | null; errorCode: string | null; errorMessage: string | null; rawResponse: string | null }> = [];

  for (const seller of candidates) {
    const result = await scrapeSellerPrice(seller.url, 2, 10000, fetcher);
    const snapshot = await recordSnapshotForSeller(db, {
      sellerId: seller.id,
      scrapedAt: now,
      priceCents: result.priceCents,
      priceText: result.priceText,
      status: result.status,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      rawResponse: result.rawResponse,
    });

    snapshots.push({
      id: snapshot.id,
      sellerId: snapshot.seller_id,
      status: snapshot.status,
      priceCents: snapshot.price_cents,
      priceText: snapshot.price_text,
      errorCode: snapshot.error_code,
      errorMessage: snapshot.error_message,
      rawResponse: snapshot.raw_response,
    });
  }

  return snapshots;
}
