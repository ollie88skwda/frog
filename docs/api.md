# Frog read API

Read-only REST API over your own training data, authenticated with a
personal access token (PAT). Create tokens in the app: **Settings → API
tokens**. The plaintext is shown once; only its sha256 hash is stored, and a
token can be revoked at any time.

- Base URL: `<SUPABASE_PROJECT_URL>/functions/v1/api` (local dev: `http://127.0.0.1:54321/functions/v1/api`)
- Auth header: `Authorization: Bearer frog_...`
- All endpoints are `GET`; anything else returns `405`.
- Pagination: `?limit=` (default 100, max 1000) and `?offset=`.
- Soft-deleted rows are never returned.

## Endpoints

### `GET /v1/exercises`

Global seed exercises (`owner_id: null`, `is_custom: false`) plus your custom ones.

```sh
curl -H "Authorization: Bearer $FROG_TOKEN" "$FROG_API_URL/v1/exercises?limit=100"
```

```json
{ "exercises": [ { "id": "…", "name": "Squat", "tags": null, "is_custom": false, "owner_id": null, "created_at": 1760000000000, "updated_at": 1760000000000 } ] }
```

### `GET /v1/sessions`

Newest first. `condition_values` maps metric id → logged value (sleep hours,
bodyweight, stress, …).

```sh
curl -H "Authorization: Bearer $FROG_TOKEN" "$FROG_API_URL/v1/sessions?limit=10"
```

### `GET /v1/sets`

Flat set logs, newest first: `weight_kg` (canonical kg), `reps`, `rir`,
`note`, `metric_values` (custom set metrics keyed by metric id).

```sh
curl -H "Authorization: Bearer $FROG_TOKEN" "$FROG_API_URL/v1/sets?limit=50"
```

### `GET /v1/export`

Everything in one payload — the same bundle as the in-app JSON export:

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
