/**
 * App display name — "Frog" (docs/brand/frog-brand-identity.html, 2026-07-16).
 *
 * This is the SINGLE source of truth for the user-facing display name. To rebrand,
 * change APP_NAME here (plus the <title> in apps/web/index.html and the PWA manifest).
 * Reference APP_NAME from UI (headers, branding) instead of hardcoding the literal anywhere.
 * Technical identifiers now agree with the display name (package scope @frog/*,
 * FROG_* env vars, frog_ token prefix) — the identifier layer was renamed on
 * 2026-07-28, see docs/DECISIONS.md. The one sanctioned literal outside this file
 * is supabase/functions/send-rest-push (Deno; cannot import @frog/core).
 */
export const APP_NAME = "Frog";

/**
 * Calendar/streak week start — Sunday (0=Sun…6=Sat), hardcoded per
 * docs/DECISIONS.md 2026-07-30. Previously a per-user preference
 * (`user_prefs.first_weekday`); the picker was removed, so every call site
 * that used to read the preference now imports this constant instead.
 */
export const FIRST_WEEKDAY = 0;
