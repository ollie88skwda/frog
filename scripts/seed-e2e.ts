// Seeds a fresh password user against LOCAL Supabase for Playwright.
// Prints JSON creds to stdout. Local-only: uses the service role key from
// `supabase status`, which never exists for the hosted project in this repo.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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
const email = `e2e-${Date.now()}@frog.test`;
const password = "e2e-password-123";

const { error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) throw new Error(error.message);

console.log(JSON.stringify({ email, password, url, anonKey }));
