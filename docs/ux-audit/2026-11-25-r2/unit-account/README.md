# Units follow the account (2026-11-25)

Source: iOS simulator report section 4 (`/Users/Ollie/joe-frog/data/frog-ios-sim/report.md`). The Home Screen app has its own storage, so the kg setting from Safari didn't carry over and it showed lb.

## Check
`e2e/unit-account.spec.ts`: two separate browser contexts (separate localStorage) signed in as one fresh account. Context A picks kg in Settings, then context B loads Settings.

- Before the fix (`before.txt`): B still shows **lb** (`unit-kg` not active). Fails.
- After the fix (`after.txt`): B shows **kg** and caches `unit=kg` locally. Passes, along with `e2e/settings.spec.ts`.
- One full `bun run e2e` run with the shared `signIn` unit reset (`full-e2e-summary.txt`): 236 passed, 28 skipped, 0 failed.

## Change
- `user_prefs.weightUnit | distanceUnit | measurementUnit` are optional and nullable (`convex/schema.ts`, `packages/core/src/db/schema.ts`). Defaults come from `resolveUserPrefs`: lb, with distance and measurement following the weight system.
- `apps/web/src/lib/settings.ts`: localStorage is now only a cache. When prefs load, the account value wins. A change writes the cache and then the account. If the account has no units yet, this device's cached units are uploaded once (`planUnitSync`, unit-tested in `settings-units.test.ts`). The hook APIs are unchanged.
- Other checks: typecheck, lint (one existing warning in `session.tsx`, not touched), `apps/web` build, bundle 182.9 kB gz (budget 220).

## Not done
No prod deploy. The schema change is additive, so it goes out with the next approved deploy. Existing users' units move to their account the first time they open the app on a device that has a cached unit.
