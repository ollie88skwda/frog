# Council Transcript — Frog v1 build plan
Date: 2026-06-20 · Skill: llm-council ("the gang")

## Original question
Run the gang to pressure-test the build plan for Frog (science "lab notebook" gym app), then proceed with the recommended path.

## Framed question
Is the v1 MVP scoped/sequenced correctly for a solo dev; is the differentiator at risk of being buried; what to build/validate first; biggest risks/false assumptions; and is deferring the Findings correlation engine to v1.x a mistake? (Full context: lab-notebook positioning, conditions logging, Findings engine, target user, v1/v1.x/v2 scope, Expo/RN + SQLite + Supabase stack, proposed build order.)

## Anonymization map (revealed)
- Response A = What-If Willy (Expansionist)
- Response B = Do-It Dora (Executor)
- Response C = Mean Mark (Contrarian)
- Response D = Clueless Chris (Outsider)
- Response E = Simple Simon (First Principles)

## Advisor responses

### Mean Mark — The Contrarian
Building a tracker for people who already have one (Hevy/Strong); high switching cost for a promissory note. Deferring Findings guts it — the differentiator IS the engine; everything else is table stakes. Conditions logging is pure tax until Findings ships; users won't log on faith; Findings then launches on low-n data → spurious correlations → a liability to a rigor audience. Scope too big and mis-prioritized. Build first: dead-simple conditions+Findings prototype on your OWN data. Validate the thesis, not the app.

### Simple Simon — First Principles
JTBD = "explain my performance to me" / "why did today suck?" Differentiator = Findings engine; you've deferred the actual product. At launch: all the tax, none of the payoff → 4-day churn. Cut: program builder, joint-action vocab, progression engine, seat recall, cloud sync. Keep: fast logging, conditions, primitive Findings (heuristics) — insight day 10 not week 12. Validate math in a spreadsheet on your own log first.

### What-If Willy — The Expansionist
Conditions logging IS the product — build it first. Differentiator = the logging habit; Findings monetizes it. Undervalued upside: a personal n-of-1 experimentation engine; "lab notebook for your body" is a platform (running, cuts, sleep, biohacking); gym is the wedge. Don't fully defer Findings — ship a teaser (week-3 hardcoded insight = addiction loop + viral moment). Cut program builder + joint-action tags.

### Clueless Chris — The Outsider
Lab-notebook idea is the only interesting part but it's buried under a normal tracker. Build the unique thing: conditions logging, dead simple. Assumption risk: logging six extra things every session forever before payoff = too much homework; "stress 1-10" is undefined. Missing: a reason to return before Findings exists. Delaying Findings is a mistake; even a dumb "last 5 workouts vs how you slept" view shows the point.

### Do-It Dora — The Executor
Validate the engine NOW in a spreadsheet before code: mock 8 weeks, write correlation logic, judge revelation vs noise. If it can't land on hand-picked data, it won't on messy low-n data. v1 too big, differentiator buried. Cut: program builder, progression engine, joint-action tags, seat/setup recall. Ship: fast logging + conditions + ghost prefill + visible Findings teaser. Deferring Findings guts you. Monday: Sheets, fake data, write the query.

## Peer reviews (3 reviewers)
- **Strongest: unanimous Do-It Dora (B)** — turns the debate into a cheap falsifiable test; separates thesis risk from app risk.
- **Biggest blind spot: unanimous What-If Willy (A)** — assumes the premise works; expands scope while others cut/validate.
- **All missed:** (1) statistical validity of n-of-1 noisy low-n correlations (confounds, multiple comparisons, reverse causality); (2) self-reported input accuracy (garbage in → garbage findings); (3) retention/distribution/business model + competitive response (Hevy adds a conditions field) + switching cost/import.

## Chairman (Leader Larry) verdict — summary
Don't build v1 as specced; reorder around the thesis. (1) Validate the correlation engine first in a spreadsheet (mocked + own real data) with statistical guardrails. (2) If it holds, build a narrow v1: fast logging + dead-simple conditions + a visible honest Findings surface from day one. (3) Defer program builder, joint-action vocab, progression engine, seat recall; reconsider sync. Keep the lab-notebook design identity; flip the feature priority so the differentiator ships at launch.

**One thing first:** spreadsheet validation of the correlation engine on mocked + own real data, before any app code.
