import { Body, Controller, Module, Param, Patch, Post } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "./main";
import { UpdatePropertyDto } from "./properties/dto";
import { FraudReportDto, MaterialEditDto } from "./properties/publishing.controller";
import { VerifyEvidenceDto } from "./commissions/commissions.controller";
import { AdminLocationReleaseDto } from "./inquiries/inquiries.controller";

const services = {
  properties: { updateDraft: vi.fn() },
  taxonomy: {},
  publishing: { reportFraud: vi.fn(), createMaterialEditReview: vi.fn() },
  translations: {},
  commissions: {},
  conversions: { verifyEvidence: vi.fn() },
  inquiries: { adminReleaseLocation: vi.fn() },
};

@Controller("owner/properties")
class RuntimePropertiesController {
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdatePropertyDto) {
    return services.properties.updateDraft(id, "test-user", body);
  }
}

@Controller("admin/publishing")
class RuntimePublishingController {
  @Post(":id/fraud")
  fraud(@Param("id") id: string, @Body() body: FraudReportDto) {
    return services.publishing.reportFraud(id, body, "test-user");
  }

  @Patch(":id/material-edit")
  materialEdit(@Param("id") id: string, @Body() body: MaterialEditDto) {
    return services.publishing.createMaterialEditReview(id, body, "test-user");
  }
}

@Controller("admin/conversions")
class RuntimeCommissionsController {
  @Post(":id/verify")
  verify(@Param("id") id: string, @Body() body: VerifyEvidenceDto) {
    return services.conversions.verifyEvidence(id, "test-user", body);
  }
}

@Controller("admin/inquiries")
class RuntimeInquiriesController {
  @Post(":id/location-release")
  release(@Param("id") id: string, @Body() body: AdminLocationReleaseDto) {
    return services.inquiries.adminReleaseLocation(id, { id: "test-user", roles: ["ADMIN"] }, body.reason);
  }
}

for (const [controller, methods] of [
  [RuntimePropertiesController, { update: UpdatePropertyDto }],
  [RuntimePublishingController, { fraud: FraudReportDto, materialEdit: MaterialEditDto }],
  [RuntimeCommissionsController, { verify: VerifyEvidenceDto }],
  [RuntimeInquiriesController, { release: AdminLocationReleaseDto }],
] as const) {
  for (const [method, dto] of Object.entries(methods)) {
    Reflect.defineMetadata("design:paramtypes", [String, dto], controller.prototype, method);
  }
}

@Module({
  controllers: [RuntimePropertiesController, RuntimePublishingController, RuntimeCommissionsController, RuntimeInquiriesController],
})
class RuntimeValidationTestModule {}

describe("runtime mutation validation over the Nest HTTP pipeline", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApiApp(RuntimeValidationTestModule);
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("test app did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const service of Object.values(services)) {
      for (const method of Object.values(service)) {
        if (typeof method === "function" && "mockClear" in method) method.mockClear();
      }
    }
  });

  async function request(path: string, method: "PATCH" | "POST", body: unknown) {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json", authorization: "Bearer test" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(`${baseUrl}${path}`, init);
  }

  it.each([
    ["missing", undefined],
    ["null", null],
    ["string", "malformed"],
    ["number", 42],
    ["boolean", true],
    ["array", []],
  ])("rejects top-level %s update payload before service mutation", async (_label, body) => {
    const response = await request("/owner/properties/property-1", "PATCH", body);
    expect(response.status).toBe(400);
    expect(services.properties.updateDraft).not.toHaveBeenCalled();
  });

  it("rejects unknown and malformed nested update fields before mutation", async () => {
    for (const body of [
      { unexpected: true },
      { publicLocation: { label: "Kilimani" } },
    ]) {
      const response = await request("/owner/properties/property-1", "PATCH", body);
      expect(response.status).toBe(400);
    }
    expect(services.properties.updateDraft).not.toHaveBeenCalled();
  });

  it("accepts a valid update and invokes the service", async () => {
    services.properties.updateDraft.mockResolvedValue({ id: "property-1" });
    const response = await request("/owner/properties/property-1", "PATCH", { title: "Updated" });
    expect(response.status).toBe(200);
    expect(services.properties.updateDraft).toHaveBeenCalledWith("property-1", "test-user", { title: "Updated" });
  });

  it.each([
    ["fraud report", "/admin/publishing/property-1/fraud", "POST", services.publishing.reportFraud],
    ["material edit", "/admin/publishing/property-1/material-edit", "PATCH", services.publishing.createMaterialEditReview],
    ["evidence verification", "/admin/conversions/conversion-1/verify", "POST", services.conversions.verifyEvidence],
    ["location release", "/admin/inquiries/inquiry-1/location-release", "POST", services.inquiries.adminReleaseLocation],
  ] as const)("rejects missing and non-object bodies for %s", async (_label, path, method, service) => {
    for (const body of [undefined, null, "malformed", 42, true, []]) {
      const response = await request(path, method, body);
      expect(response.status).toBe(400);
    }
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects unknown and malformed material offerings without transitioning the property", async () => {
    for (const body of [
      { unexpected: true },
      { offerings: { mode: "SHORT_STAY", currency: "KES", basePrice: 1000 } },
      { offerings: [{ mode: "SHORT_STAY", currency: "KES", basePrice: "1000" }] },
    ]) {
      const response = await request("/admin/publishing/property-1/material-edit", "PATCH", body);
      expect(response.status).toBe(400);
    }
    expect(services.publishing.createMaterialEditReview).not.toHaveBeenCalled();
  });

  it("accepts valid optional-only mutation payloads", async () => {
    services.publishing.reportFraud.mockResolvedValue({ ok: true });
    services.publishing.createMaterialEditReview.mockResolvedValue({ ok: true });
    services.conversions.verifyEvidence.mockResolvedValue({ ok: true });
    services.inquiries.adminReleaseLocation.mockResolvedValue({ ok: true });

    const cases = [
      ["/admin/publishing/property-1/fraud", "POST", { reason: "Review" }],
      ["/admin/publishing/property-1/material-edit", "PATCH", {
        offerings: [{ mode: "SHORT_STAY", currency: "KES", basePrice: 1000 }],
      }],
      ["/admin/conversions/conversion-1/verify", "POST", { approved: true }],
      ["/admin/inquiries/inquiry-1/location-release", "POST", { reason: "Review" }],
    ] as const;
    for (const [path, method, body] of cases) {
      expect([200, 201]).toContain((await request(path, method, body)).status);
    }
    expect(services.publishing.reportFraud).toHaveBeenCalled();
    expect(services.publishing.createMaterialEditReview).toHaveBeenCalled();
    expect(services.conversions.verifyEvidence).toHaveBeenCalled();
    expect(services.inquiries.adminReleaseLocation).toHaveBeenCalled();
  });
});
