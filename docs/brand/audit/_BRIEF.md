# Audit brief (review-only)
Repo: this worktree (Frog web app, apps/web). READ-ONLY: do NOT edit any file except your own findings file under docs/brand/audit/. No git commits.
Read first: AGENTS.md (Constraints, Conventions, Design language), docs/brand/README.md, apps/web/src/styles/theme.css.
Rules to check against, meticulously, every file in your group (read each file fully):
1. Vercel Web Interface Guidelines: docs/brand/audit/_guidelines.md (all rules).
2. Skills: /Users/Ollie/.pi/agent/skills/{better-interface,better-accessibility,better-layout,better-typography,better-colors,better-ui,better-writing,impeccable}/SKILL.md (skim relevant parts).
3. Frog rules: mobile-first, tap targets >=40px on logging path, no bare-text buttons (visible resting background), no borders/lines except the 1px text-field line, corners 4/8/12/16/24 only, Geologica, Phosphor icons only, tabular nums for numbers, reduced-motion, lazy routes, shared chrome (IconButton/IconLink/BackButton/Toolbar/Row) instead of bespoke, library components over hand-rolled, failed query must not render as empty, theme tokens only (no hardcoded hex/rgb, no off-scale radii, no raw tailwind palette colors).
4. Code quality: dead/duplicated code, unused exports, copy-pasted blocks, stale comments, old-identity (grass/sage/0px) leftovers, any-casts, inconsistent patterns. Treat the code as suspect (written by weaker models).
Also list every state of each screen (loading, empty, error, modal, sheet, onboarding) and whether it is handled.
Output: write docs/brand/audit/<your-file>.md. Format: per file, `path:line - [SEV] issue -> fix`. SEV = P0 (broken/inaccessible), P1 (clear violation), P2 (polish), P3 (nit). End with a "States inventory" table and a "Cross-cutting" list of problems that should be fixed once in shared code. Be specific and terse; fixes must be concrete enough for a single writer to apply mechanically. Use grep to be exhaustive (e.g. rg for `outline-none`, `transition-all`, `rounded-(xl|2xl|3xl|full|lg)`, `#[0-9a-f]{3,6}`, `text-(red|green|gray|zinc|slate|neutral|blue)-`, `\.\.\.`, `<div[^>]*onClick`, `aria-label`, `border`, `animate-`). 
Reply with a 3-line summary only when finished.
