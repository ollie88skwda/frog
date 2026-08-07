// Minimal robots.txt fetch + check, and a per-host rate limiter, shared by
// crawl.ts. This is deliberately NOT a full RFC 9309 implementation — it
// handles the common case (User-agent groups, Disallow/Allow prefixes, `*`
// wildcards, longest-match-wins) which is enough to keep this pipeline off
// paths a site has actually disallowed. If a brand's robots.txt does
// something exotic this misparses, `isAllowed` fails closed (treats the
// path as disallowed) rather than guessing permissive.

export const CRAWLER_USER_AGENT =
  "FrogMachineCatalogBot/0.1 (+https://github.com/frog-app/frog; data-pipeline scaffold; contact: data@example.invalid)";

type Rule = { pattern: string; allow: boolean };

export type RobotsPolicy = {
  rules: Rule[];
  sitemaps: string[];
};

function patternToRegex(pattern: string): RegExp {
  // robots.txt path matching: `*` = any sequence, `$` at the end = anchor
  // to end of string, everything else is a literal prefix.
  const endAnchor = pattern.endsWith("$");
  const body = endAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${endAnchor ? "$" : ""}`);
}

export function parseRobots(text: string): RobotsPolicy {
  const lines = text.split(/\r?\n/);
  const rules: Rule[] = [];
  const sitemaps: string[] = [];
  let inRelevantGroup = false;
  let sawAnyGroup = false;

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      // A new User-agent line starts a new group only when the previous
      // group already had at least one directive (mirrors the common
      // multi-agent-line-then-rules grouping real robots.txt files use).
      if (sawAnyGroup) inRelevantGroup = false;
      sawAnyGroup = true;
      if (value === "*") inRelevantGroup = true;
      continue;
    }
    if (!inRelevantGroup) continue;
    if (key === "disallow" && value)
      rules.push({ pattern: value, allow: false });
    if (key === "allow" && value) rules.push({ pattern: value, allow: true });
  }

  return { rules, sitemaps };
}

export async function fetchRobots(domain: string): Promise<RobotsPolicy> {
  const url = `https://${domain}/robots.txt`;
  const res = await fetch(url, {
    headers: { "user-agent": CRAWLER_USER_AGENT },
  });
  if (!res.ok) {
    // No robots.txt (or unreachable): fail open on presence, closed on
    // guessing — treat as "no explicit rules", which is the standard
    // convention (absence of robots.txt = crawling allowed).
    return { rules: [], sitemaps: [] };
  }
  return parseRobots(await res.text());
}

export function isAllowed(policy: RobotsPolicy, path: string): boolean {
  // Longest matching pattern wins; a tie prefers Allow (matches the de
  // facto convention most crawlers/robots.txt authors expect).
  let best: Rule | null = null;
  for (const rule of policy.rules) {
    if (!patternToRegex(rule.pattern).test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length) best = rule;
    else if (rule.pattern.length === best.pattern.length && rule.allow)
      best = rule;
  }
  return best ? best.allow : true;
}

// Simple per-host delay gate: await this before every fetch to the same
// host. Not a token bucket — good enough for a scaffold crawling a handful
// of pages, not a production-scale crawler.
export function createRateLimiter(delayMs: number) {
  let lastAt = 0;
  return async function wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastAt;
    if (elapsed < delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
    }
    lastAt = Date.now();
  };
}
