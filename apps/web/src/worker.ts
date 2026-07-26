interface WebEnv {
  API: { fetch: (request: Request) => Promise<Response> };
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: WebEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/invoice/")) {
      return env.API.fetch(new Request(request.url, request));
    }

    return env.ASSETS.fetch(request);
  },
};
