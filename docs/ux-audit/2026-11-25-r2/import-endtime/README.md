# Imported workouts never finished (iOS sim report §3)

Source: `/Users/Ollie/joe-frog/data/frog-ios-sim/report.md` §3.

## Cause (verified)
- `parseWorkoutText` (`packages/core/src/import/text.ts:374`) emits `endedAt: null` unless a `Duration:` line sets it (~506).
- `parseFitbodCsv` / `genericCsvToDraft` / `parseFrogCsv` (`csv-formats.ts:143,261,488`) emit `endedAt: null`; Strong/Hevy do too when the file has no duration/end column.
- `draftToImportedSessions` (`draft.ts`) passed null through; `sessions:importBatch` stored it; `sessions:active` (index `by_owner_ended`, `endedAt == null`) then returns the import as the live workout.

## Reproduction (before fix)
New test block `imported sessions are always finished` in `packages/core/src/import/import-draft.test.ts` runs every CSV fixture (hevy, strong, fitbod, jefit, generic) and the text fixtures plus the report's paste through `draftToImportedSessions`.
Before: 7 failed / 3 passed (fitbod, jefit, generic, report paste, text-hevy, text-strong, text-notes had `endedAt: null`).

Report paste through the core path:
- before: `{"title":"Push day","startedAt":"Fri Nov 20 2026 12:00","endedAt":null}`
- after:  `{"title":"Push day","startedAt":"Fri Nov 20 2026 12:00","endedAt":"Fri Nov 20 2026 12:00"}`

The in-browser paste flow was not re-run: no local Convex backend was up in this worktree. The screen calls exactly `draftToImportedSessions` → `repo.importSessions` → `sessions:importBatch`, both of which are covered by the change.

## Fix
- `draft.ts` `draftToImportedSessions`: null (or before-start) `endedAt` → `startedAt`. Zero duration, not an invented estimate, so stats duration totals stay honest (zero adds nothing).
- `convex/sessions.ts` `importBatch`: additive defensive default `endedAt: s.endedAt ?? t` for older cached clients. No schema change.

## Verification (after)
- `bunx vitest run packages/core/src/import`: 111 passed.
- `bun run typecheck` (incl. `tsc -p convex`): clean.
- `bun run lint`: clean apart from 1 existing warning in `session.tsx` (not owned here).
- `bun run --cwd apps/web build`: built.

## Repairing existing rows (NOT done; needs approval)
Rows already imported in prod with `endedAt == null` are still phantom live sessions. A repair would:
1. Select `sessions` where `endedAt == null` and `deletedAt == null` (index `by_owner_ended`).
2. Keep only imported rows: `importBatch` writes `createdAt == updatedAt == startedAt`, while a real live session's `createdAt` is its insert time and is normally later; also require `startedAt` well in the past (e.g. > 24h). A user who already pressed Finish on one has a non-null `endedAt` and is skipped.
3. Patch `endedAt = startedAt` (do not touch `updatedAt` semantics beyond a normal bump if desired).
4. Run as an `internal` mutation, paged (Convex read caps), dry-run first printing counts per owner, then apply. Users can also fix any single one now by opening it and tapping Finish.
