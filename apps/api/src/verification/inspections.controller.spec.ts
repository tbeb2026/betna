import { describe, expect, it, vi } from "vitest";
import { InspectionsController } from "./inspections.controller";

describe("InspectionsController", () => {
  it("exposes admin territory assignment through the inspection API", async () => {
    const inspections = {
      assign: vi.fn().mockResolvedValue({ id: "inspection-1", verifierId: "verifier-1" }),
    };
    const controller = new InspectionsController(inspections as any);

    await expect(
      controller.assign(
        { user: { id: "admin-1", roles: ["ADMIN"] } },
        "inspection-1",
        { verifierId: "verifier-1" },
      ),
    ).resolves.toEqual({ id: "inspection-1", verifierId: "verifier-1" });
    expect(inspections.assign).toHaveBeenCalledWith(
      "inspection-1",
      "verifier-1",
      { id: "admin-1", roles: ["ADMIN"] },
    );
  });
});
