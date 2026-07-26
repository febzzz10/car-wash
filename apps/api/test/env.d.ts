declare namespace Cloudflare {
  interface Env {
    ADMIN_LOGIN_EMAIL: string;
    ADMIN_LOGIN_PASSWORD: string;
    ALLOWED_ORIGINS: string;
    APP_ENV: string;
    AUTH_MODE: string;
    BOOTSTRAP_TOKEN: string;
    CACHE: KVNamespace;
    CSRF_SECRET: string;
    DB: D1Database;
    INVOICES: R2Bucket;
    INVOICE_LINK_TTL_SECONDS: string;
    INVOICE_TOKEN_PEPPER: string;
    SESSION_PEPPER: string;
    SESSION_TTL_SECONDS: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    UPLOADS: R2Bucket;
  }
}
