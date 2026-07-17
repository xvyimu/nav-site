/**
 * Production embed reverse proxy.
 * Why: zone aijiaqi.ccwu.cc Bot Fight challenges Vercel datacenter egress (403).
 * Path: Vercel -> this workers.dev -> https://embed.aijiaqi.ccwu.cc -> Named Tunnel -> 127.0.0.1:18003
 * Redeploy: scripts/deploy-embed-proxy-worker.ps1
 */
const embedProxyWorker = {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const originBase = (env.EMBED_ORIGIN || "https://embed.aijiaqi.ccwu.cc").replace(/\/$/, "");
    const target = new URL(incoming.pathname + incoming.search, originBase);

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      const key = k.toLowerCase();
      if (
        key === "host" ||
        key === "cf-connecting-ip" ||
        key === "x-forwarded-for" ||
        key === "x-real-ip" ||
        key === "forwarded"
      ) {
        continue;
      }
      headers.set(k, v);
    }
    headers.set("User-Agent", "nav-site-embed-client/1.0");
    headers.set("Accept", request.headers.get("Accept") || "*/*");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const resp = await fetch(target.toString(), init);
    const outHeaders = new Headers(resp.headers);
    outHeaders.delete("set-cookie");
    outHeaders.set("x-embed-proxy", "nav-site-embed-proxy");
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: outHeaders,
    });
  },
};

export default embedProxyWorker;
