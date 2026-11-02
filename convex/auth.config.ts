// Convex auth: Clerk is the only identity provider for real users. The
// Clerk JWT template named "convex" (aud = "convex") mints the tokens.
//
// Test-only: when the deployment env var TEST_JWKS is set (local/CI test
// backends only — never on dev or prod), a second issuer accepts JWTs
// signed by the key the e2e/integration harness generates, so tests can
// mint identities without Clerk. See scripts/convex-test-auth.ts.
import type { AuthConfig } from "convex/server";

// The Clerk issuer comes from the deployment env var CLERK_JWT_ISSUER_DOMAIN:
// required on every deployment (Convex rejects a push that reads an unset env
// var in this file), the dev instance's issuer locally, prod's on prod.
const CLERK_ISSUER = process.env.CLERK_JWT_ISSUER_DOMAIN;

export const TEST_ISSUER = "https://frog-test.invalid";

const providers: AuthConfig["providers"] = [
  { domain: CLERK_ISSUER as string, applicationID: "convex" },
];

if (process.env.TEST_JWKS) {
  providers.push({
    type: "customJwt",
    applicationID: "convex",
    issuer: TEST_ISSUER,
    jwks: process.env.TEST_JWKS,
    algorithm: "RS256",
  });
}

export default { providers } satisfies AuthConfig;
