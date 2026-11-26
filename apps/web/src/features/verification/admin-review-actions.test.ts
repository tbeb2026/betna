import { describe, expect, it } from "vitest";
import { assignmentPath, canAssignInspection } from "./admin-review-actions";

describe("admin verification assignment action", () => {
  it("offers assignment only for draft inspections with eligible verifiers", () => {
    expect(canAssignInspection("DRAFT", [{ id: "verifier-1", name: "Field Verifier" }])).toBe(true);
    expect(canAssignInspection("DRAFT", [])).toBe(false);
    expect(canAssignInspection("READY_FOR_REVIEW", [{ id: "verifier-1", name: "Field Verifier" }])).toBe(false);
  });

  it("builds an encoded assignment BFF path", () => {
    expect(assignmentPath("inspection/with spaces")).toBe(
      "/verification/inspections/inspection%2Fwith%20spaces/assign",
    );
  });
});
