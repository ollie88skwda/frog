# Frog schema reference

Stable, documented data model — the contract behind the export, the read
API, and the MCP server. DDL source of truth: `packages/core/src/db/schema.ts`
(Drizzle pg-core → `supabase/migrations/`).

## Conventions

- **ids**: uuid v4, generated client-side (`newId()`), never reused or renumbered.
- **timestamps**: `created_at` / `updated_at` / `deleted_at` are **millisecond epoch bigints**, app-managed.
- **soft delete**: rows get `deleted_at`; nothing is hard-deleted. Consumers must filter `deleted_at is null` (the API does this for you).
- **ownership**: every table has `owner_id` (auth user id) under row-level security. `owner_id null` on `exercises`/`metrics` marks global seed rows readable by everyone.
- **weight**: canonical **kg** in `weight_kg`; kg/lb is a display preference only.
- **custom values**: jsonb objects keyed by metric id — `sessions.condition_values` and `set_logs.metric_values`.

## Tables

### machines
The user's gym equipment — settings entered once, recalled in every session.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| brand | text? | |
| catalog_key | text? | source key when added from the catalog |
| settings | jsonb | `{label, value}[]` remembered setup |
| notes | text? | freeform setup notes |
| photo_path | text? | storage path of the user's photo |
| owner_id | uuid | |

### exercises
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| tags | jsonb | string[], light tagging (v1) |
| is_custom | boolean | false = seed row |
| machine_id | uuid? | FK → machines |
| joint_actions | jsonb | string[], display labels |
| muscle_targets | jsonb | `{muscle, tier, role?}[]`; `role` is `"primary" \| "secondary"` — absent role means index 0 is primary, everything after is secondary (back-compat, `roleAt()`). An exercise can declare two primaries. First target still decides library grouping regardless of role. |
| image_url | text? | reference diagram (seed rows only) |
| image_attribution | text? | image credit |
| exercise_type | text | measurement type (`domain/exercise-types.ts`); immutable once sets exist |
| equipment | text? | `barbell` \| `ez_bar` \| `dumbbell` \| `kettlebell` \| `machine` \| `cable` \| `band` \| `suspension` \| `bodyweight` \| `plate` \| `other` |
| instructions | jsonb? | string[], how-to steps (detail screen only) |
| image_urls | jsonb? | string[], how-to frames (detail screen only) |
| mechanic | text? | `compound` \| `isolation`; explicit, overrides the muscle-count proxy in `generator/generate.ts` |
| movement_pattern | text? | `horizontal-push` \| `vertical-push` \| `horizontal-pull` \| `vertical-pull` \| `squat` \| `hinge` \| `lunge` \| `carry` \| `rotation` \| `isolation` |
| laterality | text? | `bilateral` \| `unilateral` \| `alternating`; unilateral doubles muscle-credit and labels the reps column "reps/side" in-session |
| default_reps_min / default_reps_max | integer? | prefill only — routine editor "Add exercise" + generator; never rewrites a logged/prescribed value |
| default_rest_sec | integer? | prefill only — session rest timer default when a block has no explicit `rest_sec` |
| notes | text? | the user's own note about the exercise (setup, cue); shown read-only under the block header in a session |
| aliases | jsonb? | string[], alternate names; matched by the fuzzy matcher (voice logging, routine paste) and search alongside `name` |
| media_path | text? | storage path in the private `exercise-media` bucket (user-uploaded demo image/video, resized client-side); null = no media |
| media_type | text? | `image` \| `video`; null when `media_path` is null |
| owner_id | uuid? | null = global seed |
| created_at / updated_at / deleted_at | bigint ms | |

### metrics
Everything logged is a metric. Built-ins (reps, weight, RIR, note) are columns
on `set_logs`; custom metrics are rows here.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | e.g. "Sleep (h)", "Seat height" |
| type | text | `number` \| `scale` \| `text` \| `checkbox` |
| scope | text | `session` (condition) \| `set` |
| exercise_ids | jsonb | string[]; which exercises a set-scope metric is enabled for |
| owner_id | uuid? | null = seeded condition metric |

Seeded condition metrics (fixed ids, see `packages/core/src/db/seed-ids.ts`):
Sleep (h), Bodyweight, Pre-workout carbs (g), Caffeine (mg), Stress (1–10),
Last meal (h before), Meal note.

### tracked_conditions
A user's "experiment variables" pre-loaded into every session. A row is an
explicit choice; its absence means "use the defaults" (Sleep + Stress).
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| metric_id | uuid | FK → metrics (session-scope) |
| tracked | boolean | false = hidden from future sessions |
| position | integer? | display order |
| owner_id | uuid | one row per (owner, metric) |

### exercise_favorites
A user's favorited exercises (a separate owner-scoped table, so it works on
shared seed rows too).
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| exercise_id | uuid | FK → exercises |
| favorite | boolean | presence + true = favorited |
| owner_id | uuid | one row per (owner, exercise) |

### sessions
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| title | text? | |
| started_at / ended_at | bigint ms | |
| condition_values | jsonb | {metric_id: value} |
| share_slug | text? | dormant — future public share link, unused today |
| owner_id | uuid | |

### session_exercises
One exercise performed within one session, ordered.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK → sessions |
| exercise_id | uuid | FK → exercises |
| order_index | integer | position within the session |
| owner_id | uuid | |

### set_logs
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| session_exercise_id | uuid | FK → session_exercises |
| set_no | integer | 0-based within the exercise block |
| weight_kg | real? | canonical kg |
| reps | integer? | |
| rir | integer? | legacy scalar reps-in-reserve; read-compat fallback when rir_min/rir_max are both null |
| rir_min / rir_max | integer? | logged RIR range; round-tripped by the repo, the API and the export today, but no app surface writes them yet (range logging lands with the session-logging follow-up) |
| rpe | real? | 1–10 perceived exertion (halves allowed) |
| rest_sec | integer? | seconds rested before this set (null = first/unknown) |
| note | text? | |
| metric_values | jsonb | {metric_id: value} for enabled set metrics |
| completed | boolean | |
| owner_id | uuid | |

### api_tokens
Personal access tokens for the read API (not part of the export).
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | user label |
| token_hash | text | sha256 of the plaintext; plaintext never stored |
| created_at / last_used_at / revoked_at | bigint ms | revoked_at set = dead |
| owner_id | uuid | |

### routine_folders
Groups routines (program/split/goal). Owner-scoped, no seeds.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| position | integer | drag order |
| owner_id | text | |

### routines
Reusable workout templates. Starting one pre-fills a live session.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| folder_id | uuid? | FK → routine_folders; null = unfiled |
| position | integer | list order |
| description | text? | |
| owner_id | text | |

### routine_exercises
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| routine_id | uuid | FK → routines |
| exercise_id | uuid | FK → exercises |
| order_index | integer | |
| superset_group | integer? | same int = same superset; null = none |
| rest_sec | integer? | countdown target; null = default, 0 = off |
| note | text? | persistent template note (re-renders every session) |
| owner_id | text | |

### routine_sets
Target prescription per set. `target_reps_max` non-null ⇒ rep range
[`target_reps`, `target_reps_max`]; rep-range sets are never auto-updated by
Update Routine Values.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| routine_exercise_id | uuid | FK |
| set_no | integer | |
| set_type | text | 'normal' \| 'warmup' \| 'failure' \| 'drop' |
| target_weight_kg | real? | |
| target_reps | integer? | |
| target_reps_max | integer? | non-null ⇒ rep range |
| target_duration_sec | integer? | duration types |
| target_distance_m | real? | distance types (canonical meters) |
| target_rir_min / target_rir_max | integer? | target RIR range (reps-based exercise types only) |
| owner_id | text | |

### programs
Generator/library provenance. Progression state is not stored — the overload
rule reads history via `sessions.routine_id`.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| source | text | 'generated' \| 'library' |
| library_key | text? | catalog key when source='library' |
| config | jsonb | questionnaire answers |
| folder_id | uuid | FK → routine_folders |
| active | boolean | |
| owner_id | text | |

### measurements
One entry per local day (unique owner + measured_on). Canonical bodyweight
store (volume math, trends, generator report); the seeded Bodyweight
condition mirrors into it. Progress photo is part of the day's entry.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| measured_on | text | local YYYY-MM-DD, unique per owner |
| bodyweight_kg | real? | |
| bodyfat_pct | real? | |
| neck_cm … calf_r_cm | real? | 14 circumference columns (canonical cm) |
| photo_path | text? | progress-photos bucket; always private |
| owner_id | text | |

### exercise_prefs
Per-exercise prefs; satellite on shared seed rows (favorites pattern).
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| exercise_id | uuid | unique per owner |
| weight_unit | text? | 'kg' \| 'lb'; null = global default |
| generator_excluded | boolean | "don't recommend again" |
| owner_id | text | |

### user_prefs
One row per user. Only semantics-bearing/cross-device settings live here;
pure device behavior (theme, display unit, sounds…) stays in localStorage.
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| first_weekday | integer | 0=Sun … 6=Sat (streak/calendar semantics) |
| include_warmups_in_stats | boolean | toggling recomputes records client-side |
| default_rest_sec | integer? | null = off; applies to exercises added later |
| previous_values_scope | text | 'any' \| 'routine' |
| body_diagram | text | heat-map figure variant |
| plate_config | jsonb | `{barKg, platesKg[], barLb, platesLb[], dumbbellStepKg}` |
| display_name | text? | |
| owner_id | text | unique |

### session_media
Workout photos attached at save (photos v1; ≤3 app-enforced).
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK → sessions |
| path | text | session-media bucket (private) |
| position | integer | carousel order |
| media_type | text | 'photo' (video = backlog) |
| owner_id | text | |

### push_subscriptions
Web-push endpoints for rest-timer/PR notifications (M12).
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| endpoint | text | unique |
| keys | jsonb | `{p256dh, auth}` |
| owner_id | text | |

### Column additions (2026-07-15, Hevy parity)
- `exercises`: + `exercise_type` (8 measurement types; immutable once logged — duplicate-as-custom resets), `equipment`, `instructions` (jsonb string[]), `image_urls` (jsonb string[] how-to frames).
- `set_logs`: + `set_type`, `duration_sec`, `distance_m`. `weight_kg` is reinterpreted per exercise type (added weight for weighted-bodyweight, assistance for assisted-bodyweight).
- `session_exercises`: + `superset_group`, `rest_sec`, `note`, `routine_exercise_id` (provenance → routine write-back + same-routine PREVIOUS scope).
- `sessions`: + `routine_id` (provenance; null = empty workout), `paused_ms` (duration = ended − started − paused).

### Column additions (2026-07-30, custom exercise adder)
- `exercises`: + `mechanic`, `movement_pattern`, `laterality`, `default_reps_min`, `default_reps_max`, `default_rest_sec`, `notes`, `aliases` (jsonb string[]), `media_path`, `media_type`. `muscle_targets` entries gained an optional `role` field (`"primary" | "secondary"`, back-compat absent = index-0-primary). All nullable, no default — a book row that never fills them behaves exactly as before.
- New private storage bucket `exercise-media`, RLS-scoped to the owning user (same `(storage.foldername(name))[1] = (select auth.jwt()->>'sub')` pattern as `session-media`/machine photos), holding the file `media_path` points at.
- `GET /v1/exercises` (and the `exercises` field of `GET /v1/export`) now select the full row instead of a hand-picked column list — see docs/DECISIONS.md.
