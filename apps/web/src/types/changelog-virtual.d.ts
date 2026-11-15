// Virtual modules backed by vite.config.ts's `changelogPlugin`, which parses
// docs/DECISIONS.md at dev/build time — see that file for why this is split
// into a tiny eager module (nav badge) and a large lazy one (/changelog).

declare module "virtual:changelog-latest" {
  export const latestChangelogDate: string | null;
}

declare module "virtual:changelog-entries" {
  import type { ChangelogEntry } from "@frog/core";

  const entries: ChangelogEntry[];
  export default entries;
}
