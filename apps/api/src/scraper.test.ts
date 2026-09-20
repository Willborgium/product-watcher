import { describe, expect, it } from 'vitest';
import {
  classifyScrapeError,
  listScrapeCandidates,
  normalizeMoneyString,
  parsePriceFromHtml,
  runDailyScrape,
  scrapeSellerPrice,
} from './scraper';

describe('scraper helpers', () => {
  it('normalizes common currency strings into integer cents', () => {
    expect(normalizeMoneyString('$19.99')).toBe(1999);
    expect(normalizeMoneyString('€19,99')).toBe(1999);
    expect(normalizeMoneyString('19,99 €')).toBe(1999);
    expect(normalizeMoneyString('not-a-price')).toBeNull();
  });

  it('extracts a price from HTML content or rejects missing prices', () => {
    expect(parsePriceFromHtml('<html><body>Now only $19.99</body></html>')).toBe(1999);
    expect(parsePriceFromHtml('<html><body>No pricing here</body></html>')).toBeNull();
  });

  it('scrapes the live Target product price for Goldfish crackers', async () => {
    const url = 'https://www.target.com/p/goldfish-colors-cheddar-cheese-crackers-27-3oz/-/A-88951127';
    const result = await scrapeSellerPrice(url, 1, 20000, async (input: string | URL | Request) =>
      fetch(input as string, { headers: { 'user-agent': 'Mozilla/5.0' } }),
    );

    expect(result.status).toBe('success');
    expect(result.priceCents).not.toBeNull();
    expect(result.priceCents!).toBeGreaterThan(0);
    expect(result.priceText).toMatch(/\$?\d+[\.,]\d{2}/);
  }, 30000);

  it('classifies timeout and parse failures consistently', () => {
    expect(classifyScrapeError(new Error('timeout'))).toBe('timeout');
    expect(classifyScrapeError(new Error('parse_error'))).toBe('parse_error');
    expect(classifyScrapeError(new Error('network failure'))).toBe('network_error');
  });

  it('filters candidates down to active products and sellers only', async () => {
    const records = [
      { id: 's-1', product_id: 'p-1', product_is_active: 1, url: 'https://example.com/one', is_active: 1 },
      { id: 's-2', product_id: 'p-1', product_is_active: 1, url: 'https://example.com/two', is_active: 0 },
      { id: 's-3', product_id: 'p-2', product_is_active: 0, url: 'https://example.com/three', is_active: 1 },
    ];

    const candidates = listScrapeCandidates(records as any);
    expect(candidates).toEqual([
      { id: 's-1', product_id: 'p-1', url: 'https://example.com/one', is_active: 1 },
    ]);
  });

  it('records a successful scrape result with integer cents', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [{ id: 'seller-1', url: 'https://example.com/price', is_active: 1, product_id: 'product-1', product_is_active: 1 }] }),
          run: async () => ({ meta: { last_row_id: 1 } }),
          first: async () => null,
        }),
      }),
    } as any;

    const result = await scrapeSellerPrice('https://example.com/price', 1, 20, async () => '<html>$19.99</html>');
    expect(result.status).toBe('success');
    expect(result.priceCents).toBe(1999);
    expect(result.priceText).toBe('$19.99');
    expect(result.errorCode).toBeNull();

    const snapshot = await runDailyScrape(db, async () => ({ results: [{ id: 'seller-1', url: 'https://example.com/price', is_active: 1, product_id: 'product-1', product_is_active: 1 }] }), async () => ({
      text: async () => '<html>$19.99</html>',
    }) as any);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.status).toBe('success');
    expect(snapshot[0]?.priceCents).toBe(1999);
  });
});
