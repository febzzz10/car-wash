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
    GEOCODE_CACHE_PEPPER: string;
    GEOCODE_CACHE_TTL_SECONDS: string;
    GEOCODE_USER_AGENT: string;
    GMAIL_CLIENT_ID: string;
    GMAIL_CLIENT_SECRET: string;
    GMAIL_REFRESH_TOKEN: string;
    GMAIL_SENDER_EMAIL: string;
    INVOICES: R2Bucket;
    INVOICE_EMAIL_IDEMPOTENCY_TTL_SECONDS: string;
    INVOICE_EMAIL_RATE_LIMIT: string;
    INVOICE_LINK_TTL_SECONDS: string;
    LOCATIONIQ_API_KEY: string;
    LOCATIONIQ_BASE_URL: string;
    NOMINATIM_THROTTLE: DurableObjectNamespace;
    SESSION_PEPPER: string;
    SESSION_TTL_SECONDS: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    UPLOADS: R2Bucket;
  }
}
