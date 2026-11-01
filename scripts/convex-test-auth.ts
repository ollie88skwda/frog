// Test identities for a local Convex backend, without Clerk.
//
// convex/auth.config.ts accepts a second JWT issuer (TEST_ISSUER) when the
// deployment env var TEST_JWKS is set. This module generates that key pair
// (WebCrypto, no dependency), returns the JWKS as the data: URI Convex
// expects, and signs RS256 JWTs for any `sub`. The private key stays in
// this process (and, for the e2e runner, in a 0600 temp file); it is
// throwaway and only ever trusted by local/CI test backends.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export const TEST_ISSUER = "https://frog-test.invalid";
const KID = "frog-test";

const b64url = (buf: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(
    typeof buf === "string" ? buf : new Uint8Array(buf as ArrayBuffer),
  ).toString("base64url");

export type TestAuth = {
  /** data: URI JWKS to `convex env set TEST_JWKS`. */
  jwks: string;
  /** Signs a 1h token whose `sub` becomes identity.subject. */
  mint: (sub: string, claims?: Record<string, unknown>) => Promise<string>;
};

async function fromPrivateJwk(priv: JsonWebKey): Promise<TestAuth> {
  const key = await crypto.subtle.importKey(
    "jwk",
    priv,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const pub = { kty: priv.kty, n: priv.n, e: priv.e };
  const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(
    JSON.stringify({ keys: [{ ...pub, kid: KID, alg: "RS256", use: "sig" }] }),
  ).toString("base64")}`;
  const mint = async (sub: string, claims: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
    const payload = b64url(
      JSON.stringify({
        iss: TEST_ISSUER,
        aud: "convex",
        sub,
        iat: now - 5,
        exp: now + 3600,
        ...claims,
      }),
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${b64url(sig)}`;
  };
  return { jwks, mint };
}

/** Fresh in-memory key pair. */
export async function createTestAuth(): Promise<TestAuth> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  return fromPrivateJwk(
    (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey,
  );
}

/**
 * Key pair persisted at `path` (0600) so separate processes — the e2e
 * runner, the seed script, Playwright workers — sign with the same key.
 */
export async function loadOrCreateTestAuth(path: string): Promise<TestAuth> {
  if (existsSync(path)) {
    return fromPrivateJwk(JSON.parse(readFileSync(path, "utf8")));
  }
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  writeFileSync(path, JSON.stringify(priv), { mode: 0o600 });
  chmodSync(path, 0o600);
  return fromPrivateJwk(priv as JsonWebKey);
}
