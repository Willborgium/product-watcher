/// <reference types="@cloudflare/workers-types" />

declare global {
  interface Env {
    DB: D1Database;
    API_ENV?: string;
    SERVICE_NAME?: string;
  }
}

export {};
