interface WebEnv {
  API: { fetch: (request: Request) => Promise<Response> };
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const SPA_HTML = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>WashPro</title><script type="module" crossorigin src="/assets/index-CZeIn3du.js"><\/script><link rel="stylesheet" crossorigin href="/assets/index-Bizq0kUI.css"></head><body><div id="root"></div></body></html>`;

export default {
  async fetch(request: Request, env: WebEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return env.API.fetch(request);
    }

    if (url.pathname.startsWith("/invoice/")) {
      return env.API.fetch(request);
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return new Response(SPA_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }
  },
};
