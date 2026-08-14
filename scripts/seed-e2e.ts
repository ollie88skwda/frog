// Seeds a fresh password user against LOCAL Supabase for Playwright.
// Prints JSON creds to stdout. Local-only: uses the service role key from
// `supabase status`, which never exists for the hosted project in this repo.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { purgeStaleE2eUsers } from "./e2e-cleanup";

const raw = execSync("supabase status -o json", { encoding: "utf8" });
// The CLI may print warnings (e.g. "Stopped services: ...") before the JSON.
const status = JSON.parse(raw.slice(raw.indexOf("{")));
const url: string = status.API_URL ?? status.api_url;
const anonKey: string = status.ANON_KEY ?? status.anon_key;
const serviceKey: string = status.SERVICE_ROLE_KEY ?? status.service_role_key;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    `unexpected supabase status output: ${Object.keys(status).join(", ")}`,
  );
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

// Sweep stale e2e accounts from past runs before adding another — see
// e2e-cleanup.ts. Best-effort: a sweep failure must never block seeding this
// run's own user, so it's logged to stderr (stdout is reserved for the JSON
// creds run-e2e.ts parses) and swallowed.
try {
  const { checked, purged } = await purgeStaleE2eUsers(admin);
  if (purged.length > 0) {
    console.error(`Swept ${purged.length}/${checked} stale e2e account(s).`);
  }
} catch (e) {
  console.error(`Stale e2e sweep failed (continuing): ${(e as Error).message}`);
}

const email = `e2e-${Date.now()}@frog.test`;
const password = "e2e-password-123";

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) throw new Error(error.message);

console.log(
  JSON.stringify({ id: data.user.id, email, password, url, anonKey }),
);
