import { readFileSync, writeFileSync } from "node:fs";

const [command, baseUrl, ...arguments_] = process.argv.slice(2);
const token = process.env.WASHPRO_R2_BRIDGE_TOKEN;
if (!command || !baseUrl || !token) {
  throw new Error("R2 bridge client arguments are incomplete.");
}

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

if (command === "health") {
  const response = await request("/health");
  if (!response.ok) process.exitCode = 1;
} else if (command === "list") {
  const [binding] = arguments_;
  const objects = [];
  let cursor;
  do {
    const url = new URL("/objects", baseUrl);
    url.searchParams.set("binding", binding);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await request(url);
    if (!response.ok)
      throw new Error(`R2 list failed with ${response.status}.`);
    const page = await response.json();
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  process.stdout.write(JSON.stringify(objects));
} else if (command === "get") {
  const [binding, key, outputPath] = arguments_;
  const url = new URL("/object", baseUrl);
  url.searchParams.set("binding", binding);
  url.searchParams.set("key", key);
  const response = await request(url);
  if (response.status === 404) {
    process.exitCode = 44;
  } else if (!response.ok) {
    throw new Error(`R2 get failed with ${response.status}.`);
  } else {
    writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
    const encoded = response.headers.get("x-washpro-object-metadata");
    if (!encoded) throw new Error("R2 object metadata was not returned.");
    process.stdout.write(decodeURIComponent(encoded));
  }
} else if (command === "put") {
  const [binding, key, inputPath, metadataPath] = arguments_;
  const url = new URL("/object", baseUrl);
  url.searchParams.set("binding", binding);
  url.searchParams.set("key", key);
  const metadata = readFileSync(metadataPath, "utf8");
  const response = await request(url, {
    body: readFileSync(inputPath),
    headers: {
      "Content-Type": "application/octet-stream",
      "x-washpro-object-metadata": encodeURIComponent(metadata),
    },
    method: "PUT",
  });
  if (!response.ok) throw new Error(`R2 put failed with ${response.status}.`);
  process.stdout.write(await response.text());
} else {
  throw new Error(`Unknown R2 bridge client command: ${command}`);
}
