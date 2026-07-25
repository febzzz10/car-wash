export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const workerRequest = new Request(
    `https://api${url.pathname}${url.search}`,
    request,
  );

  return env.API.fetch(workerRequest);
}
