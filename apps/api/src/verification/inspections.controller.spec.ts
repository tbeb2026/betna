import { describe, expect, it, vi } from "vitest";
import { InspectionsController } from "./inspections.controller";
import { ChecklistService } from "./checklist.service";

describe("InspectionsController", () => {
  it("exposes admin territory assignment through the inspection API", async () => {
    const inspections = {
      assign: vi.fn().mockResolvedValue({ id: "inspection-1", verifierId: "verifier-1" }),
    };
    const controller = new InspectionsController(inspections as any, {} as ChecklistService);

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

  it("exposes eligible verifiers through the guarded admin API", async () => {
    const inspections = {
      listEligibleVerifiers: vi.fn().mockResolvedValue([
        { id: "verifier-1", name: "Field Verifier" },
      ]),
    };
    const controller = new InspectionsController(inspections as any, {} as ChecklistService);

    await expect(controller.verifiers("inspection-1")).resolves.toEqual([
      { id: "verifier-1", name: "Field Verifier" },
    ]);
    expect(inspections.listEligibleVerifiers).toHaveBeenCalledWith("inspection-1");
  });

  it("passes the authenticated verifier identity to evidence synchronization", async () => {
    const inspections = {
      markEvidenceSynced: vi.fn().mockResolvedValue({ status: "READY_FOR_REVIEW" }),
    };
    const controller = new InspectionsController(inspections as any, {} as ChecklistService);

    await controller.sync(
      { user: { id: "verifier-1" } },
      "inspection-1",
      "media-1",
      { ok: true, validated: true },
    );

    expect(inspections.markEvidenceSynced).toHaveBeenCalledWith(
      "inspection-1",
      "media-1",
      { ok: true, validated: true },
      "verifier-1",
    );
  });
});
