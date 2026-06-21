import { describe, it, expect } from "vitest";
import { tokens } from "./tokens";
describe("tokens", () => {
  it("uses the blueprint accent", () => { expect(tokens.color.accent).toBe("#38BDF8"); });
  it("uses an 8pt-based space scale", () => { expect(tokens.space).toContain(8); });
});
