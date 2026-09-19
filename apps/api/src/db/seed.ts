import type { D1Database } from '@cloudflare/workers-types';
import { addNotificationLog, addSeller, createPriceSnapshot, createProduct, createSubscription } from './index';

export async function seedMilestoneTwoData(db: D1Database) {
  const product = await createProduct(db, { name: 'Bike' });

  const sellerA = await addSeller(db, { productId: product.id, url: 'https://bike-world.example/bike' });
  const sellerB = await addSeller(db, { productId: product.id, url: 'https://cycling-supplies.example/bike' });

  await createPriceSnapshot(db, {
    sellerId: sellerA.id,
    scrapedAt: '2026-09-01T08:00:00.000Z',
    priceCents: 99999,
    priceText: '$999.99',
    status: 'success',
  });

  await createPriceSnapshot(db, {
    sellerId: sellerA.id,
    scrapedAt: '2026-09-02T08:00:00.000Z',
    status: 'failure',
    errorCode: 'timeout',
    errorMessage: 'Request timed out',
  });

  await createPriceSnapshot(db, {
    sellerId: sellerB.id,
    scrapedAt: '2026-09-03T08:00:00.000Z',
    priceCents: 109999,
    priceText: '$1,099.99',
    status: 'success',
  });

  const subscription = await createSubscription(db, { productId: product.id, email: 'alerts@example.com' });

  await addNotificationLog(db, {
    productId: product.id,
    subscriptionId: subscription.id,
    sellerId: sellerA.id,
    sentAt: '2026-09-03T12:00:00.000Z',
    status: 'sent',
    priceCents: 109999,
    previousPriceCents: 99999,
    reason: 'Price dropped below prior threshold',
    dedupeKey: 'product-bike-2026-09-03',
  });

  return {
    product,
    sellers: [sellerA, sellerB],
    subscription,
  };
}
