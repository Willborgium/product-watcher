import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  validateProductPayload,
  validateSellerInput,
  validatePriceSnapshot,
  validateSubscriptionInput,
} from './validation';

describe('database validation helpers', () => {
  it('accepts valid product and seller payloads', () => {
    expect(validateProductPayload({ name: 'Bike' })).toMatchObject({
      ok: true,
      value: { name: 'Bike', slug: 'bike' },
    });
    expect(
      validateSellerInput({ productId: 'product-1', url: 'https://example.com/bike' }),
    ).toEqual({ ok: true, normalizedUrl: 'https://example.com/bike' });
  });

  it('rejects invalid emails and malformed seller URLs', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(validateSellerInput({ productId: 'product-1', url: 'not a url' })).toMatchObject({
      ok: false,
    });
    expect(validateSubscriptionInput({ productId: 'product-1', email: 'invalid' })).toMatchObject({
      ok: false,
    });
  });

  it('ensures snapshots either have a valid price or explicit failure metadata', () => {
    expect(
      validatePriceSnapshot({
        sellerId: 'seller-1',
        scrapedAt: '2026-09-19T00:00:00.000Z',
        priceCents: 12345,
        status: 'success',
      }),
    ).toEqual({ ok: true });

    expect(
      validatePriceSnapshot({
        sellerId: 'seller-1',
        scrapedAt: '2026-09-19T00:00:00.000Z',
        status: 'failure',
        errorCode: 'timeout',
        errorMessage: 'Request timed out',
      }),
    ).toEqual({ ok: true });

    expect(
      validatePriceSnapshot({
        sellerId: 'seller-1',
        scrapedAt: '2026-09-19T00:00:00.000Z',
        status: 'success',
      }),
    ).toMatchObject({ ok: false });
  });
});
