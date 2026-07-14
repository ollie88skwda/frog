# SBL schema reference

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
| muscle_targets | jsonb | `{muscle, tier}[]`; first = primary (library grouping) |
| image_url | text? | reference diagram (seed rows only) |
| image_attribution | text? | image credit |
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
| rir | integer? | reps in reserve |
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
