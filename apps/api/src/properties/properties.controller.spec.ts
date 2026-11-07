import { describe, expect, it, vi } from "vitest";
import { PropertiesController } from "./properties.controller";

describe("PropertiesController", () => {
  it("exposes managed geography for owner forms", async () => {
    const geography = [
      {
        code: "KE",
        name: "Kenya",
        currency: "KES",
        cities: [{ id: "city-ke-nairobi", name: "Nairobi", slug: "nairobi" }],
      },
    ];
    const properties = { listGeography: vi.fn().mockResolvedValue(geography) };
    const controller = new PropertiesController(
      properties as never,
      {} as never,
    );

    await expect(controller.geographyOptions()).resolves.toEqual(geography);
    expect(properties.listGeography).toHaveBeenCalledOnce();
  });
});
