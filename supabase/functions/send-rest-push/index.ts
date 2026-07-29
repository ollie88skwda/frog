// Thin web-push sender (Hevy-parity M12, plan §F). Sends a push notification to
// the authenticated user's registered devices — the supplementary path behind
// the guaranteed one (in-page WebAudio + the SW-local notification the app fires
// from alertRestDone). Delivery is best-effort: this is NOT required for the
// rest timer to work.
//
// Auth mirrors the read API (supabase/functions/api): Bearer `frog_...` PAT,
// sha256-matched against api_tokens, service-role client + explicit owner_id
// filter. Never exposes the service role to the browser.
//
// Configuration: needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT as
// function secrets (generate once with `npx web-push generate-vapid-keys`; the
// public key also goes to the app as VITE_VAPID_PUBLIC_KEY). Absent → 501 and
// the Settings toggle shows "requires server keys" and degrades gracefully.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const configured = VAPID_PUBLIC.length > 0 && VAPID_PRIVATE.length > 0;
if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!configured) {
    return json({ error: "push not configured (VAPID keys required)" }, 501);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token.startsWith("frog_")) return json({ error: "missing bearer token" }, 401);
  const { data: tokenRow, error: tokenError } = await admin
    .from("api_tokens")
    .select("owner_id, revoked_at")
    .eq("token_hash", await sha256hex(token))
    .maybeSingle();
  if (tokenError) return json({ error: tokenError.message }, 500);
  if (!tokenRow || tokenRow.revoked_at != null) {
    return json({ error: "invalid or revoked token" }, 401);
  }
  const owner = tokenRow.owner_id as string;

  const payload = await req.json().catch(() => ({}));
  const message = JSON.stringify({
    // Edge Functions are Deno and can't import @frog/core, so APP_NAME is
    // inlined here — the one sanctioned exception to the single-source rule.
    // Keep in sync with packages/core/src/config.ts.
    title: typeof payload.title === "string" ? payload.title : "Frog",
    body: typeof payload.body === "string" ? payload.body : "Rest timer done",
    tag: "frog-rest",
  });

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("owner_id", owner)
    .is("deleted_at", null);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let pruned = 0;
  for (const s of subs ?? []) {
    const subscription = { endpoint: s.endpoint as string, keys: s.keys };
    try {
      await webpush.sendNotification(subscription, message);
      sent++;
    } catch (e) {
      // 404/410 = the browser dropped the subscription; soft-delete it.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await admin
          .from("push_subscriptions")
          .update({ deleted_at: Date.now() })
          .eq("id", s.id);
        pruned++;
      }
    }
  }
  return json({ sent, pruned, devices: (subs ?? []).length });
});
