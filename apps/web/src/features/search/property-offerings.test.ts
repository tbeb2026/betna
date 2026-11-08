import { describe, expect, it } from "vitest";
import { resolveSelectedMode } from "./property-offerings";

describe("property offering mode selection", () => {
  it("resets to the first available mode when offerings change", () => {
    expect(resolveSelectedMode(["SHORT_STAY"], "LONG_TERM")).toBe("SHORT_STAY");
  });

  it("preserves the selected mode while it remains available", () => {
    expect(resolveSelectedMode(["SHORT_STAY", "LONG_TERM"], "LONG_TERM")).toBe("LONG_TERM");
  });
});
