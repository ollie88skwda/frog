# Frog read API

Read-only REST API over your own training data, authenticated with a
personal access token (PAT). Create tokens in the app: **Settings → API
tokens**. The plaintext is shown once; only its sha256 hash is stored, and a
token can be revoked at any time.

- Base URL: `<SUPABASE_PROJECT_URL>/functions/v1/api` (local dev: `http://127.0.0.1:54321/functions/v1/api`)
- Auth header: `Authorization: Bearer frog_...`
- All endpoints are `GET`; anything else returns `405`.
- Pagination: `?limit=` (default 100, max 1000) and `?offset=`, on the list endpoints.
- Soft-deleted rows are never returned.

## Endpoints

### `GET /v1/exercises`

Global seed exercises (`owner_id: null`, `is_custom: false`) plus your custom
ones. Every column on the `exercises` table (see [schema.md](./schema.md)) —
there's no separate hand-picked subset here, so a new column shows up
automatically instead of silently missing the API.

```sh
curl -H "Authorization: Bearer $FROG_TOKEN" "$FROG_API_URL/v1/exercises?limit=100"
```

```json
{ "exercises": [ { "id": "…", "name": "Squat", "tags": null, "is_custom": false, "owner_id": null, "muscle_targets": [{ "muscle": "quads", "tier": "S" }], "equipment": "barbell", "aliases": null, "notes": null, "created_at": 1760000000000, "updated_at": 1760000000000 } ] }
```

### `GET /v1/sessions`

Newest first. `condition_values` maps metric id → logged value (sleep hours,
bodyweight, stress, …).

```sh
curl -H "Authorization: Bearer $FROG_TOKEN" "$FROG_API_URL/v1/sessions?limit=10"
```

### `GET /v1/sets`

Flat set logs, newest first: `weight_kg` (canonical kg), `reps`, `rir`,
`rir_min` / `rir_max`, `note`, `metric_values` (custom set metrics keyed by
metric id). `rir` is the legacy scalar; read it as the fallback when both
range columns are null (see [schema.md](./schema.md#set_logs)).

```sh
curl -H "Authorization: Bearer $FROG_TOKEN" "$FROG_API_URL/v1/sets?limit=50"
```

### `GET /v1/export`

Everything in one payload — the same bundle as the in-app JSON export. Takes
no `limit`/`offset`: every row is returned, however large the account.

```json
{
  "schema_version": 1,
  "exported_at": 1760000000000,
  "exercises": [], "metrics": [], "sessions": [], "session_exercises": [], "set_logs": []
}
```

## Errors

| Status | Meaning |
|---|---|
| 401 | Missing, malformed, unknown, or revoked token |
| 404 | Unknown path (body lists valid endpoints) |
| 405 | Non-GET method (the API is read-only) |

## Schema

See [schema.md](./schema.md) for tables, columns, and conventions.
