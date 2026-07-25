export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const workerUrl = `https://api${url.pathname}${url.search}`;
  const workerRequest = new Request(workerUrl, request);

  return env.API.fetch(workerRequest);
}
