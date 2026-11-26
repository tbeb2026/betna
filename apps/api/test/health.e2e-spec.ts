import { describe, expect, it, vi } from "vitest";
import { HealthController } from "../src/health/health.controller";

describe("API health probes", () => {
  it("reports liveness without requiring a database connection", () => {
    const controller = new HealthController({ $queryRaw: vi.fn() } as never);

    expect(controller.live()).toMatchObject({
      status: "ok",
      service: "api",
    });
  });

  it("reports readiness only when the database probe succeeds", async () => {
    const query = vi.fn().mockResolvedValue([{ ok: 1 }]);
    const controller = new HealthController({ $queryRaw: query } as never);
    const response = { status: vi.fn().mockReturnThis() };

    await expect(controller.ready(response as never)).resolves.toMatchObject({
      status: "ok",
      checks: { database: "up" },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("returns a non-ready response when the database probe fails", async () => {
    const controller = new HealthController({
      $queryRaw: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as never);
    const response = { status: vi.fn().mockReturnThis() };

    await expect(controller.ready(response as never)).resolves.toMatchObject({
      status: "degraded",
      checks: { database: "down" },
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
