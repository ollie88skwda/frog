// Framework-free: uses Web Crypto where present (RN Hermes + Node 19+ both expose globalThis.crypto.randomUUID).
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
