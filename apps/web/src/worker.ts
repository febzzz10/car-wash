interface WebEnv {
  API: { fetch: (request: Request) => Promise<Response> };
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: WebEnv): Promise<Response> {
    const url = new URL(request.url);

    // Proxy /api/* requests to the car-wash service binding
    if (url.pathname.startsWith("/api/")) {
      const proxyUrl = new URL(request.url);
      // Rewrite for the backend Worker - it expects its own host
      const workerRequest = new Request(proxyUrl.toString(), request);
      return env.API.fetch(workerRequest);
    }

    // Forward /invoice/* public routes to the API
    if (url.pathname.startsWith("/invoice/")) {
      const proxyRequest = new Request(request.url, request);
      return env.API.fetch(proxyRequest);
    }

    // Everything else: serve static assets (SPA fallback)
    return env.ASSETS.fetch(request);
  },
};
