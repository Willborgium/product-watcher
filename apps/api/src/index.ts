import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono<{ Bindings: { API_ENV?: string; SERVICE_NAME?: string } }>();

app.use(
  '*',
  cors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
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

export default app;
