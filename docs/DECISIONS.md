# DECISIONS.md — SBL decision log

Terse, dated log of product/design/architecture decisions. **Rule: when a new decision overrides an old one, edit the old entry in place — mark it `SUPERSEDED → [see entry]` — so this file never contradicts itself.** Add an entry in the same commit as the change it describes.

## Product

- **2026-06-20** — SBL is a training lab notebook: log work + conditions, surface correlations ("Findings") with transparent stats, no AI/ML black boxes. Second moat: open data (export, PAT API, MCP). PRD: `docs/superpowers/specs/2026-06-20-sbl-prd.html`.
- **2026-06-20** — "SBL" is a placeholder name; single source `APP_NAME` in `packages/core/src/config.ts`.
- **2026-07-12** — v1 web is online-first (Supabase-direct, account required). Offline deferred to mobile phase behind the `Repo` seam. Never promise offline in UI copy.
- **2026-07-12** — Exercise library organized by **muscle group (primary)** with joint action shown as a label per exercise. ~~Joint-action-primary~~ SUPERSEDED same day: joint actions shift target muscle by ROM (elbow flexion 20–90° biases biceps, >90° biases brachialis/brachioradialis) and grip (pronated/neutral biases brachialis) — too nuanced for top-level grouping.
- **2026-07-12** — **Tier ratings (S/A/B/C)**: per-exercise `muscleTargets` `{muscle, tier}` drives grouping/sorting; core `ACTION_RATINGS` (muscle × joint action → tier + nuance note + citations) powers education and "best exercise for a muscle". Tiers are evidence-informed judgment calls compiled from EMG/MRI/hypertrophy literature; thin evidence is flagged in notes.
- **2026-07-12** — **Machines are separate entities** (own library), not exercise fields: name, brand, catalog link, ordered numbered settings (`[{label, value}]`), notes, photo. In-session setup strip under the exercise header; edits persist to the machine row → "same setup every time, remembered forever".
- **2026-07-12** — **Machine catalog** is a static, lazy-loaded TS module (`packages/core/src/data/machine-catalog.ts`) of real commercial models (Matrix, Hammer Strength, Life Fitness, Technogym, …), scoped to major brands' strength lines — not a DB table, not "every machine ever". Catalog imagery = category line-art icons.
- **2026-07-12** — **Machine photos are user-taken only** (camera upload → private Supabase Storage bucket, owner-scoped). Third-party/manufacturer photos are copyrighted — "publicly visible" ≠ public property — and stay out.
- **2026-07-12** — **Lessons**: in-app micro-education (InfoTip → Dialog). Ultra-concise (couple of lines), optional tiny visual, optional `citations` (PMID/DOI). Seen-state in localStorage. First lesson: RIR (placeholder copy until Ollie supplies final).
- **2026-07-12** — **FUTURE (not built): PubMed science coaching** — rule-based (not necessarily AI) nudges citing studies when a plan choice contradicts evidence. Seams shipped now: `citations` on lessons and on `ACTION_RATINGS`.

## Design

- **2026-07-12** — Linear-style techie-modern UI (graph-paper/blueprint identity retired; Expo app archived on `legacy/expo`). Dense 13px, keyboard-first, ⌘K, tabular numerals, 100–150ms transitions, nothing animates on the data path.
- **2026-07-12** — **Blue monochrome, base `#034078`** (user-picked hex). ~~Red monochrome accent~~ SUPERSEDED. Every non-semantic color = `color-mix(in oklab, #034078 N%, black|white)` percentage step; only the hex is locked — step percentages tune against measured contrast. Exceptions: `--pos/--neg/--warn` keep green/red/yellow for findings direction + destructive affordances (small text/icons only, never fills); shadows/overlays stay neutral black/white alpha (they read as light, not color).
- **2026-07-12** — **0px border radius everywhere** (square/brutalist): all `--radius-*` tokens 0, no `rounded-full` pills/dots (squares instead). `status-ring` SVG circle stays (glyph, not radius).
- **2026-07-12** — **8px grid, HARD RULE**: all spacing and box sizes are multiples of 8px (4px sub-steps allowed on mobile/micro-spacing); layouts align to a 12-column rhythm. Type scale (13px base) is exempt — the rule governs boxes/spacing, not glyphs. Do not break this in new UI.
- **2026-07-12** — Mobile-first mandate: every screen designed at 390×844 first; bottom tab bar on mobile (`pb-20` compensation), desktop sidebar.

## Architecture

- **2026-07-12** — Bun monorepo: `apps/web` (Vite React SPA) + `packages/core` (framework-free domain, Drizzle schema, `Repo` seam) + `packages/mcp` + `supabase/`. One language: TypeScript. No Rust.
- **2026-07-12** — All data access via `Repo` interface; `SupabaseRepo` is v1. `packages/core` stays free of React/DOM/supabase imports outside `repo/`.
- **2026-07-12** — jsonb-over-normalized precedent for light structured data (`tags`, `condition_values`, `metric_values`, machine `settings`, `muscle_targets`, `joint_actions`) — app-validated, no DB constraints.
- **2026-07-12** — Seed rows (`owner_id NULL`) are readable by all, writable only by migrations (RLS). Seed classifications fixed via future migration if wrong. Consequence: machine attach + classification editing are custom-exercise-only in UI.
- **2026-07-12** — Optimistic UI pattern: synchronous `onMutate` cache updates in `apps/web/src/lib/queries.ts`; logging path never waits on network. Initial JS ≤220 kB gzipped, CI-gated; heavy reference data (machine catalog) ships as lazy chunks.
- **2026-07-12** — Local prefs (unit, theme, lesson seen-state) live in localStorage via `useSyncExternalStore` modules in `apps/web/src/lib/` — no server prefs table.
