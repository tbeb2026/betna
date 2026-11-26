import { describe, expect, it, vi } from "vitest";
import { ChecklistService } from "./checklist.service";

describe("ChecklistService", () => {
  it("fails explicitly when persistence is not configured", async () => {
    const service = new ChecklistService({} as never);

    await expect(service.getPersisted("residential")).rejects.toThrow(/not configured/i);
  });

  it("does not fall back to an in-memory checklist when the category is missing", async () => {
    const service = new ChecklistService({
      checklistDefinition: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as never);

    await expect(service.getPersisted("residential")).rejects.toThrow(/no published checklist/i);
  });

  it("loads an exact persisted version, including an unpublished historical definition", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      category: "residential",
      version: 4,
      isPublished: false,
      definition: { required: ["legacyItem"], rules: { legacyItem: "PASS" } },
    });
    const service = new ChecklistService({ checklistDefinition: { findFirst } } as never);

    await expect(service.getPersisted("residential", 4)).resolves.toEqual({
      category: "residential",
      version: 4,
      required: ["legacyItem"],
      rules: { legacyItem: "PASS" },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { category: "residential", version: 4 },
    });
  });
});
