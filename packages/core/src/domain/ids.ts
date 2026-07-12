// Framework-free, portable uuid v4.
// Node 19+ and web expose globalThis.crypto.randomUUID; React Native (Hermes)
// does NOT, so fall back to a self-contained v4 generator there. Sufficient for
// local record IDs (which only need to be unique + stable for sync).
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
