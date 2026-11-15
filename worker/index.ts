// Runs only for /assets/* (wrangler.jsonc `assets.run_worker_first`); every
// other path is served straight from the static assets with the SPA fallback.
// A hashed chunk from a superseded deploy must stay a real 404 so `lazyRoute`
// (apps/web/src/app.tsx) can detect it and reload — the SPA fallback would
// otherwise answer it with index.html (200, text/html).

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const IMMUTABLE = "public, max-age=31536000, immutable";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await env.ASSETS.fetch(request);
    // Vite never emits HTML under /assets/, so an HTML answer here is the SPA
    // fallback for a missing file.
    const type = res.headers.get("content-type") ?? "";
    if (res.status === 404 || type.startsWith("text/html")) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    if (!res.ok && res.status !== 304) return res;
    const out = new Response(res.body, res);
    out.headers.set("cache-control", IMMUTABLE);
    return out;
  },
};
