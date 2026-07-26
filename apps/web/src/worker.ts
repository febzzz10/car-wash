interface WebEnv {
  API: { fetch: (request: Request) => Promise<Response> };
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: WebEnv): Promise<Response> {
    const url = new URL(request.url);

    // Proxy /api/* requests to the car-wash service binding.
    // run_worker_first routes these paths here unconditionally (even browser
    // navigations), and new Request(url, request) preserves the method,
    // headers, cookies and body.
    if (url.pathname.startsWith("/api/")) {
      return env.API.fetch(new Request(url.toString(), request));
    }

    // Forward /invoice/* public routes to the API.
    if (url.pathname.startsWith("/invoice/")) {
      return env.API.fetch(new Request(request.url, request));
    }

    // Everything else: serve static assets via the ASSETS binding. With
    // not_found_handling = "single-page-application", unmatched paths are
    // rewritten to /index.html with a 200, giving every React Router route
    // the SPA shell without a redirect.
    return env.ASSETS.fetch(request);
  },
};
