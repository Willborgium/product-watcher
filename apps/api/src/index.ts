import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { migrationStatus } from './db';

const app = new Hono<{ Bindings: { API_ENV?: string; SERVICE_NAME?: string; DB?: any } }>();

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://product-watcher-web.wjcustode.workers.dev',
  'https://product-watcher-web.pages.dev',
]);

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
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
  const db = c.env?.DB;
  if (!db) {
    return c.json({ ok: false, error: 'Database binding missing.' }, 500);
  }

  try {
    const stats = await migrationStatus(db);
    return c.json({
      ok: true,
      service: c.env?.SERVICE_NAME ?? 'api',
      database: 'product-watcher-db',
      tables: stats.tables,
      count: stats.count,
    });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown DB error.' }, 500);
  }
});

export default app;
