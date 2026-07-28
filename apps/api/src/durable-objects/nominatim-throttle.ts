interface QueuedItem {
  url: string;
  userAgent: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

export class NominatimThrottle {
  private readonly ctx: DurableObjectState;
  private nextAllowedAt = 0;
  private initialized = false;
  private queue: QueuedItem[] = [];
  private processing = false;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initialized) {
      await this.ctx.blockConcurrencyWhile(async () => {
        const stored = await this.ctx.storage.get<number>("nextAllowedAt");
        if (stored !== undefined) {
          this.nextAllowedAt = stored;
        }
        this.initialized = true;
      });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const url = body.url as string | undefined;
    const userAgent = body.userAgent as string | undefined;

    if (typeof url !== "string" || typeof userAgent !== "string") {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    return new Promise<Response>((resolve, reject) => {
      this.queue.push({ url, userAgent, resolve, reject });
      if (!this.processing) {
        this.processing = true;
        this.processQueue().catch(() => {});
      }
    });
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextAllowedAt - now);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const item = this.queue.shift()!;
      const callStartedAt = Date.now();
      const updatedNextAllowed = callStartedAt + 1000;

      try {
        await this.ctx.storage.put("nextAllowedAt", updatedNextAllowed);
        this.nextAllowedAt = updatedNextAllowed;
      } catch {
        item.reject(new Error("PROVIDER_FAILED"));
        continue;
      }

      const result = await this.callProvider(item);
      item.resolve(result);
    }
    this.processing = false;
  }

  private async callProvider(item: QueuedItem): Promise<Response> {
    try {
      const response = await fetch(item.url, {
        headers: { "User-Agent": item.userAgent, "Accept-Language": "en" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: "PROVIDER_FAILED" }),
          { status: 502, headers: { "content-type": "application/json" } },
        );
      }
      const text = await response.text();
      return new Response(text, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "PROVIDER_FAILED" }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }
  }
}
