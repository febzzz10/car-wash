function json(value, status = 200) {
  return Response.json(value, { status });
}

function resolveBucket(env, name) {
  if (name === "UPLOADS") return env.UPLOADS;
  if (name === "INVOICES") return env.INVOICES;
  return undefined;
}

function objectSummary(object) {
  return {
    checksums: object.checksums ?? null,
    customMetadata: object.customMetadata ?? {},
    etag: object.etag,
    httpMetadata: object.httpMetadata ?? {},
    key: object.key,
    size: object.size,
    uploaded:
      object.uploaded instanceof Date
        ? object.uploaded.toISOString()
        : object.uploaded,
  };
}

async function handle(request, env) {
  if (
    !env.MIGRATION_BRIDGE_TOKEN ||
    request.headers.get("authorization") !==
      `Bearer ${env.MIGRATION_BRIDGE_TOKEN}`
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ status: "ok" });
  }

  const binding = url.searchParams.get("binding");
  const bucket = resolveBucket(env, binding);
  if (!bucket) return json({ error: "Unknown R2 binding" }, 400);

  if (url.pathname === "/objects" && request.method === "GET") {
    const cursor = url.searchParams.get("cursor") || undefined;
    const listed = await bucket.list({
      cursor,
      include: ["httpMetadata", "customMetadata"],
      limit: 1000,
    });
    return json({
      cursor: listed.truncated ? (listed.cursor ?? null) : null,
      objects: listed.objects.map(objectSummary),
      truncated: listed.truncated,
    });
  }

  const key = url.searchParams.get("key");
  if (!key) return json({ error: "An object key is required" }, 400);

  if (url.pathname === "/object-metadata" && request.method === "GET") {
    const object = await bucket.head(key);
    return object
      ? json(objectSummary(object))
      : json({ error: "Not found" }, 404);
  }

  if (url.pathname === "/object" && request.method === "GET") {
    const object = await bucket.get(key);
    if (!object) return json({ error: "Not found" }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set(
      "x-washpro-object-metadata",
      encodeURIComponent(JSON.stringify(objectSummary(object))),
    );
    return new Response(object.body, { headers });
  }

  if (url.pathname === "/object" && request.method === "PUT") {
    const encoded = request.headers.get("x-washpro-object-metadata");
    if (!encoded) return json({ error: "Object metadata is required" }, 400);
    const metadata = JSON.parse(decodeURIComponent(encoded));
    const object = await bucket.put(key, request.body, {
      customMetadata: metadata.customMetadata ?? {},
      httpMetadata: metadata.httpMetadata ?? {},
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!object) {
      return json({ error: "Object was created concurrently" }, 409);
    }
    return json(objectSummary(object), 201);
  }

  return json({ error: "Unsupported operation" }, 405);
}

export default { fetch: handle };
