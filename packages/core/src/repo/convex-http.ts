// A ~zero-dependency ConvexTransport over Convex's public HTTP API
// (POST <deployment>/api/query|mutation). The web app uses this instead of
// the `convex` client: TanStack Query already owns caching/retries and the
// app is online-first request/response, so the websocket client would add
// bundle weight for live-query machinery nothing uses.
//
// The function name is repeated as `?fn=` (and a generic reader's table as
// `&t=`) purely so a request is identifiable from its URL (Playwright route
// intercepts, devtools); the backend ignores both and dispatches on the
// body's `path`.
import type { ConvexTransport } from "./convex";

export type ConvexHttpOpts = {
  /** Deployment URL, e.g. https://happy-frog-123.convex.cloud. */
  url: string;
  /** Current identity JWT, or null when signed out (fails closed server-side). */
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
};

/** Raised for a function-level failure; `message` is user-presentable when
 * the server threw a ConvexError (its `data` string). */
export class ConvexCallError extends Error {
  constructor(
    message: string,
    readonly fn: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ConvexCallError";
  }
}

/** Strips Convex's "[Request ID: …] Server Error\nUncaught Error: " framing
 * and the stack, leaving the thrown message. */
export function cleanConvexMessage(raw: string): string {
  const lines = raw
    .replace(/^\[Request ID: [^\]]+\]\s*/, "")
    .replace(/^Server Error\s*/, "")
    .split("\n")
    .filter((l) => !/^\s+at /.test(l));
  return (
    lines
      .join("\n")
      .replace(/^Uncaught (?:ConvexError|Error):\s*/, "")
      .trim() || "Server error"
  );
}

export function convexHttpTransport(opts: ConvexHttpOpts): ConvexTransport {
  const base = opts.url.replace(/\/+$/, "");
  const call = async <T>(
    kind: "query" | "mutation",
    fn: string,
    args: Record<string, unknown>,
  ): Promise<T> => {
    const token = await opts.getToken();
    const f = opts.fetch ?? fetch;
    let res: Response;
    try {
      const t = typeof args.table === "string" ? `&t=${args.table}` : "";
      res = await f(`${base}/api/${kind}?fn=${fn}${t}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path: fn, format: "json", args }),
      });
    } catch (e) {
      // Keep the "<ConstructorName>: msg" shape apps/web/src/lib/repo-error.ts
      // recognises as a transport failure.
      const err = e as Error;
      throw new Error(`${err?.name ?? "FetchError"}: ${err?.message ?? e}`, {
        cause: e,
      });
    }
    const text = await res.text();
    let body: {
      status?: string;
      value?: unknown;
      errorMessage?: string;
      errorData?: unknown;
    } | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (body?.status === "success") return body.value as T;
    if (body?.status === "error") {
      const data = body.errorData;
      const msg =
        typeof data === "string"
          ? data
          : cleanConvexMessage(body.errorMessage ?? "");
      throw new ConvexCallError(msg, fn, data);
    }
    throw new ConvexCallError(
      `${fn} failed (${res.status}): ${text.slice(0, 200) || res.statusText}`,
      fn,
    );
  };
  return {
    query: (fn, args) => call("query", fn, args),
    mutation: (fn, args) => call("mutation", fn, args),
  };
}
