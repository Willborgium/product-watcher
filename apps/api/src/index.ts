import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database } from '@cloudflare/workers-types';
import {
  createProduct,
  createSeller,
  deleteSeller,
  getProductById,
  getSellerById,
  listProducts,
  listSellersForProduct,
  migrationStatus,
  setProductActiveState,
  setSellerActiveState,
  updateProduct,
  updateSeller,
} from './db';

const app = new Hono<{ Bindings: { API_ENV?: string; SERVICE_NAME?: string; DB?: D1Database } }>();

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://product-watcher-web.wjcustode.workers.dev',
  'https://product-watcher-web.pages.dev',
]);

function getDb(c: any): D1Database {
  const db = c.env?.DB;
  if (!db) {
    throw new Error('Database binding missing.');
  }

  return db;
}

async function parseJsonBody(c: any): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function jsonError(c: any, message: string, status: number) {
  return c.json({ ok: false, error: message }, status);
}

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (allowedOrigins.has(origin)) return origin;
      if (origin.endsWith('.product-watcher-web.wjcustode.workers.dev')) return origin;
      if (origin.endsWith('.pages.dev')) return origin;
      return 'null';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.get('/health', (c) => {
  const envName = c.env?.API_ENV ?? 'local';
  const timestamp = new Date().toISOString();

  return c.json({
    ok: true,
    service: c.env?.SERVICE_NAME ?? 'api',
    env: envName,
    timestamp,
  });
});

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: c.env?.SERVICE_NAME ?? 'api',
    message: 'Product Watcher API is running.',
  });
});

app.get('/db/health', async (c) => {
  try {
    const db = getDb(c);
    const stats = await migrationStatus(db);
    return c.json({
      ok: true,
      service: c.env?.SERVICE_NAME ?? 'api',
      database: 'product-watcher-db',
      tables: stats.tables,
      count: stats.count,
    });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : 'Unknown DB error.', 500);
  }
});

app.get('/products', async (c) => {
  try {
    const db = getDb(c);
    const products = await listProducts(db);
    return c.json({ ok: true, products });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : 'Unknown DB error.', 500);
  }
});

app.post('/products', async (c) => {
  try {
    const db = getDb(c);
    const body = await parseJsonBody(c);
    const product = await createProduct(db, body as any);
    return c.json({ ok: true, product }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    const status = /not found|required|valid|invalid|must be|already exists/i.test(message) ? 400 : /not found/i.test(message) ? 404 : /already exists/i.test(message) ? 409 : 500;
    return jsonError(c, message, status);
  }
});

app.get('/products/:id', async (c) => {
  try {
    const db = getDb(c);
    const product = await getProductById(db, c.req.param('id'));
    if (!product) {
      return jsonError(c, 'Product not found.', 404);
    }

    return c.json({ ok: true, product });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : 'Unknown DB error.', 500);
  }
});

app.put('/products/:id', async (c) => {
  try {
    const db = getDb(c);
    const body = await parseJsonBody(c);
    const product = await updateProduct(db, c.req.param('id'), body as any);
    return c.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    const status = /not found/i.test(message) ? 404 : /required|valid|invalid|must be|already exists/i.test(message) ? 400 : 500;
    return jsonError(c, message, status);
  }
});

app.patch('/products/:id/disable', async (c) => {
  try {
    const db = getDb(c);
    const product = await setProductActiveState(db, c.req.param('id'), false);
    return c.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    return jsonError(c, message, /not found/i.test(message) ? 404 : 500);
  }
});

app.patch('/products/:id/enable', async (c) => {
  try {
    const db = getDb(c);
    const product = await setProductActiveState(db, c.req.param('id'), true);
    return c.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    return jsonError(c, message, /not found/i.test(message) ? 404 : 500);
  }
});

app.get('/products/:productId/sellers', async (c) => {
  try {
    const db = getDb(c);
    const productId = c.req.param('productId');
    const product = await getProductById(db, productId);
    if (!product) {
      return jsonError(c, 'Product not found.', 404);
    }

    const sellers = await listSellersForProduct(db, productId);
    return c.json({ ok: true, sellers });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : 'Unknown DB error.', 500);
  }
});

app.post('/products/:productId/sellers', async (c) => {
  try {
    const db = getDb(c);
    const body = await parseJsonBody(c);
    const productId = c.req.param('productId');
    const product = await getProductById(db, productId);
    if (!product) {
      return jsonError(c, 'Product not found.', 404);
    }

    const seller = await createSeller(db, { ...(body as Record<string, unknown>), productId } as any);
    return c.json({ ok: true, seller }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    const status = /not found/i.test(message) ? 404 : /required|valid|invalid|must be/i.test(message) ? 400 : /already exists/i.test(message) ? 409 : 500;
    return jsonError(c, message, status);
  }
});

app.get('/products/:productId/sellers/:sellerId', async (c) => {
  try {
    const db = getDb(c);
    const productId = c.req.param('productId');
    const sellerId = c.req.param('sellerId');
    const seller = await getSellerById(db, sellerId);
    if (!seller || seller.product_id !== productId) {
      return jsonError(c, 'Seller not found.', 404);
    }

    return c.json({ ok: true, seller });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : 'Unknown DB error.', 500);
  }
});

app.put('/products/:productId/sellers/:sellerId', async (c) => {
  try {
    const db = getDb(c);
    const body = await parseJsonBody(c);
    const productId = c.req.param('productId');
    const sellerId = c.req.param('sellerId');
    const seller = await getSellerById(db, sellerId);
    if (!seller || seller.product_id !== productId) {
      return jsonError(c, 'Seller not found.', 404);
    }

    const updatedSeller = await updateSeller(db, sellerId, { ...(body as Record<string, unknown>), productId } as any);
    return c.json({ ok: true, seller: updatedSeller });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    const status = /not found/i.test(message) ? 404 : /required|valid|invalid|must be|already exists/i.test(message) ? 400 : /already exists/i.test(message) ? 409 : 500;
    return jsonError(c, message, status);
  }
});

app.delete('/products/:productId/sellers/:sellerId', async (c) => {
  try {
    const db = getDb(c);
    const productId = c.req.param('productId');
    const sellerId = c.req.param('sellerId');
    const seller = await getSellerById(db, sellerId);
    if (!seller || seller.product_id !== productId) {
      return jsonError(c, 'Seller not found.', 404);
    }

    const updatedSeller = await deleteSeller(db, sellerId);
    return c.json({ ok: true, seller: updatedSeller });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    return jsonError(c, message, /not found/i.test(message) ? 404 : 500);
  }
});

app.patch('/products/:productId/sellers/:sellerId/disable', async (c) => {
  try {
    const db = getDb(c);
    const productId = c.req.param('productId');
    const sellerId = c.req.param('sellerId');
    const seller = await getSellerById(db, sellerId);
    if (!seller || seller.product_id !== productId) {
      return jsonError(c, 'Seller not found.', 404);
    }

    const updatedSeller = await setSellerActiveState(db, sellerId, false);
    return c.json({ ok: true, seller: updatedSeller });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    return jsonError(c, message, /not found/i.test(message) ? 404 : 500);
  }
});

app.patch('/products/:productId/sellers/:sellerId/enable', async (c) => {
  try {
    const db = getDb(c);
    const productId = c.req.param('productId');
    const sellerId = c.req.param('sellerId');
    const seller = await getSellerById(db, sellerId);
    if (!seller || seller.product_id !== productId) {
      return jsonError(c, 'Seller not found.', 404);
    }

    const updatedSeller = await setSellerActiveState(db, sellerId, true);
    return c.json({ ok: true, seller: updatedSeller });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error.';
    return jsonError(c, message, /not found/i.test(message) ? 404 : 500);
  }
});

export default app;
