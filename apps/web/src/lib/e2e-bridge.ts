import { convexHttpTransport } from "@frog/core/repo/convex-http";

// Playwright-only auth bridge (VITE_E2E=1 builds). Clerk is never mounted in
// E2E builds; instead Playwright mints a token for a throwaway identity with
// the local test signing key (scripts/convex-test-auth.ts — accepted only by
// a backend whose TEST_JWKS matches, which scripts/convex-test-env.ts sets on
// local backends alone) and hands it in through `window.__frog.signIn`. The
// app sources its Convex token from here.
//
// `e2eBridge` is `undefined` in real builds — every `e2eBridge ? … : …` branch
// is compile-time dead code there; scripts/check-bundle.ts asserts the bridge
// marker never reaches a production bundle.

export type E2eSession = { token: string; email: string; userId: string };

type E2eBridge = {
  getToken: () => string | null;
  getSession: () => E2eSession | null;
  signIn: (token: string, email: string) => void;
  signOut: () => void;
  onAuthChange: (cb: (s: E2eSession | null) => void) => () => void;
  db: E2eDb;
};

const STORAGE_KEY = "frog-e2e-auth";

function subOf(token: string): string {
  const part = token.split(".")[1] ?? "";
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return (JSON.parse(json) as { sub: string }).sub;
}

function createBridge(): E2eBridge {
  const listeners = new Set<(s: E2eSession | null) => void>();
  const read = (): E2eSession | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as E2eSession) : null;
  };
  const emit = () => {
    const s = read();
    for (const l of listeners) l(s);
  };
  const bridge: Omit<E2eBridge, "db"> = {
    getToken: () => read()?.token ?? null,
    getSession: read,
    signIn: (token, email) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token, email, userId: subOf(token) }),
      );
      emit();
    },
    signOut: () => {
      localStorage.removeItem(STORAGE_KEY);
      emit();
    },
    onAuthChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const transport = convexHttpTransport({
    url: import.meta.env.VITE_CONVEX_URL as string,
    getToken: async () => bridge.getToken(),
  });
  return { ...bridge, db: createE2eDb(transport, bridge.getSession) };
}

// --- Test-only row access ----------------------------------------------------
//
// A small PostgREST-shaped query builder over the generic owner-scoped
// rows:find / rows:insert / rows:update functions, so specs can seed and
// assert server state as the signed-in user (`window.__frog.db.from(...)`)
// with the same snake_case column names the schema docs use. Equality/IN
// filters run server-side; the rest are applied to the returned rows. It is
// held to the same authorization as the app: only the caller's rows (plus
// global rows of exercises/metrics/machine_catalog) are visible or writable.

type Row = Record<string, unknown>;
type Transport = ReturnType<typeof convexHttpTransport>;
type Result = {
  // Untyped like an unparameterised supabase-js client: specs index rows freely.
  // biome-ignore lint/suspicious/noExplicitAny: test-only, deliberately loose
  data: any;
  count: number | null;
  error: { message: string } | null;
};

const GLOBAL_TABLES = new Set(["exercises", "metrics", "machine_catalog"]);

const camel = (s: string) =>
  s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toSnake = (r: Row) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [snake(k), v]));
const toCamel = (r: Row) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]));

type Filter = (r: Row) => boolean;

export type E2eDb = {
  from: (table: string) => Query;
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } }; error: null }>;
  };
};

class Query implements PromiseLike<Result> {
  private where: Row = {};
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private cols: string[] | null = null;
  private countOnly = false;
  private mode: "select" | "update" | "insert" = "select";
  private patch: Row | null = null;
  private rows: Row[] = [];
  private one: "single" | "maybe" | null = null;

  constructor(
    private t: Transport,
    private table: string,
  ) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.mode === "select") {
      this.cols =
        cols.trim() === "*"
          ? null
          : cols
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean);
      this.countOnly = opts?.head === true;
    }
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.where[camel(col)] = val;
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.where[camel(col)] = vals;
    return this;
  }
  is(col: string, val: null) {
    const k = camel(col);
    this.filters.push((r) => (r[k] ?? null) === val);
    return this;
  }
  not(col: string, op: "is", val: null) {
    if (op !== "is") throw new Error(`e2e db: unsupported not(${op})`);
    const k = camel(col);
    this.filters.push((r) => (r[k] ?? null) !== val);
    return this;
  }
  gte(col: string, val: number) {
    const k = camel(col);
    this.filters.push((r) => (r[k] as number) >= val);
    return this;
  }
  lt(col: string, val: number) {
    const k = camel(col);
    this.filters.push((r) => (r[k] as number) < val);
    return this;
  }
  ilike(col: string, pattern: string) {
    const k = camel(col);
    const re = new RegExp(
      `^${pattern
        .split("%")
        .map((p) => p.replace(/[.*+?^${}()|[\]\\_]/g, "\\$&"))
        .join(".*")}$`,
      "i",
    );
    this.filters.push((r) => re.test(String(r[k] ?? "")));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col: camel(col), asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }

  private async find(): Promise<Row[]> {
    const rows = await this.t.query<Row[]>("rows:find", {
      table: this.table,
      where: this.where,
      ...(GLOBAL_TABLES.has(this.table) ? { global: true } : {}),
    });
    let out = rows.filter((r) => this.filters.every((f) => f(r)));
    for (const { col, asc } of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[col] as number | string | null;
        const y = b[col] as number | string | null;
        const c = x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -1 : 1;
        return asc ? c : -c;
      });
    }
    return this.max === null ? out : out.slice(0, this.max);
  }

  private shape(rows: Row[]): Row[] {
    return rows.map((r) => {
      const s = toSnake(r);
      return this.cols
        ? Object.fromEntries(this.cols.map((c) => [c, s[c] ?? null]))
        : s;
    });
  }

  private async run(): Promise<Result> {
    if (this.mode === "insert") {
      const stored = await this.t.mutation<Row[]>("rows:insert", {
        table: this.table,
        rows: this.rows.map(toCamel),
      });
      return { data: this.shape(stored), count: null, error: null };
    }
    if (this.mode === "update") {
      const ids = (await this.find()).map((r) => r.id as string);
      if (ids.length === 0) return { data: [], count: 0, error: null };
      const stored = await this.t.mutation<Row[]>("rows:update", {
        table: this.table,
        where: { id: ids },
        patch: toCamel(this.patch ?? {}),
      });
      return { data: this.shape(stored), count: stored.length, error: null };
    }
    const rows = await this.find();
    if (this.countOnly) return { data: null, count: rows.length, error: null };
    const data = this.shape(rows);
    if (this.one) {
      if (data.length > 1 || (this.one === "single" && data.length === 0)) {
        return {
          data: null,
          count: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
          },
        };
      }
      return { data: data[0] ?? null, count: null, error: null };
    }
    return { data, count: rows.length, error: null };
  }

  // biome-ignore lint/suspicious/noThenProperty: deliberately thenable — specs `await` the builder, PostgREST-style.
  then<A = Result, B = never>(
    ok?: ((r: Result) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run()
      .catch((e: unknown) => ({
        data: null,
        count: null,
        error: { message: e instanceof Error ? e.message : String(e) },
      }))
      .then(ok, bad);
  }
}

function createE2eDb(t: Transport, session: () => E2eSession | null): E2eDb {
  return {
    from: (table) => new Query(t, table),
    auth: {
      getUser: async () => {
        const s = session();
        if (!s) throw new Error("E2E bridge: not signed in");
        return { data: { user: { id: s.userId } }, error: null };
      },
    },
  };
}

export const e2eBridge: E2eBridge | undefined =
  import.meta.env.VITE_E2E === "1" ? createBridge() : undefined;
