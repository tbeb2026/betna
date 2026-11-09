import { Body, Controller, Module, Patch, Post } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "./main";
import { ConversionReportDto } from "./commissions/commissions.controller";
import { CreateUnavailableDateDto } from "./availability/availability.controller";
import { GuestInquiryDto } from "./inquiries/inquiries.controller";
import { CreateUploadTargetBody } from "./media/media.controller";
import {
  MaterialEditDto,
  OwnershipChangeDto,
} from "./properties/publishing.controller";
import { UpdatePropertyDto } from "./properties/dto";
import { AssignInspectionDto, SubmitInspectionDto } from "./verification/inspections.controller";

const services = {
  properties: { updateDraft: vi.fn() },
  publishing: {
    createMaterialEditReview: vi.fn(),
    reverifyOwnershipChange: vi.fn(),
  },
  conversions: { report: vi.fn() },
  inquiries: { create: vi.fn() },
  media: { createUploadTarget: vi.fn() },
  inspections: { assign: vi.fn(), submit: vi.fn() },
  availability: { create: vi.fn() },
};

@Controller("owner/properties")
class RuntimeUuidPropertiesController {
  @Patch("update")
  update(@Body() body: UpdatePropertyDto) {
    return services.properties.updateDraft("property-id", "test-user", body);
  }
}

@Controller("admin/publishing")
class RuntimeUuidPublishingController {
  @Patch("material-edit")
  materialEdit(@Body() body: MaterialEditDto) {
    return services.publishing.createMaterialEditReview("property-id", body, "test-user");
  }

  @Patch("ownership-change")
  ownershipChange(@Body() body: OwnershipChangeDto) {
    return services.publishing.reverifyOwnershipChange("property-id", body.newOwnerId, {
      id: "test-user",
      roles: ["ADMIN"],
    });
  }
}

@Controller("owner/conversions")
class RuntimeUuidConversionsController {
  @Post()
  report(@Body() body: ConversionReportDto) {
    return services.conversions.report({ ...body, ownerId: "test-user" });
  }
}

@Controller("public/inquiries")
class RuntimeUuidInquiriesController {
  @Post()
  create(@Body() body: GuestInquiryDto) {
    return services.inquiries.create(body);
  }
}

@Controller("media")
class RuntimeUuidMediaController {
  @Post("upload")
  upload(@Body() body: CreateUploadTargetBody) {
    return services.media.createUploadTarget(body);
  }
}

@Controller("verification")
class RuntimeUuidInspectionsController {
  @Post("assign")
  assign(@Body() body: AssignInspectionDto) {
    return services.inspections.assign(body);
  }

  @Post("submit")
  submit(@Body() body: SubmitInspectionDto) {
    return services.inspections.submit(body);
  }
}

@Controller("owner/availability")
class RuntimeUuidAvailabilityController {
  @Post("unavailable")
  create(@Body() body: CreateUnavailableDateDto) {
    return services.availability.create(body);
  }
}

for (const [controller, methods] of [
  [RuntimeUuidPropertiesController, { update: UpdatePropertyDto }],
  [RuntimeUuidPublishingController, { materialEdit: MaterialEditDto, ownershipChange: OwnershipChangeDto }],
  [RuntimeUuidConversionsController, { report: ConversionReportDto }],
  [RuntimeUuidInquiriesController, { create: GuestInquiryDto }],
  [RuntimeUuidMediaController, { upload: CreateUploadTargetBody }],
  [RuntimeUuidInspectionsController, { assign: AssignInspectionDto, submit: SubmitInspectionDto }],
  [RuntimeUuidAvailabilityController, { create: CreateUnavailableDateDto }],
] as const) {
  for (const [method, dto] of Object.entries(methods)) {
    const parameterTypes = method === "report" ? [dto] : [dto];
    Reflect.defineMetadata("design:paramtypes", parameterTypes, controller.prototype, method);
  }
}

@Module({
  controllers: [
    RuntimeUuidPropertiesController,
    RuntimeUuidPublishingController,
    RuntimeUuidConversionsController,
    RuntimeUuidInquiriesController,
    RuntimeUuidMediaController,
    RuntimeUuidInspectionsController,
    RuntimeUuidAvailabilityController,
  ],
})
class RuntimeUuidValidationTestModule {}

const UUID = "11111111-1111-4111-8111-111111111111";

describe("body UUID references over the Nest HTTP pipeline", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApiApp(RuntimeUuidValidationTestModule);
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
        method.mockReset();
        method.mockResolvedValue({ ok: true });
      }
    }
  });

  async function request(path: string, method: "PATCH" | "POST", body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it.each([
    ["countryId", { countryId: "not-a-uuid" }],
    ["cityId", { cityId: "not-a-uuid" }],
    ["neighborhoodId", { neighborhoodId: "not-a-uuid" }],
  ])("rejects malformed property %s before service invocation", async (_field, body) => {
    const response = await request("/owner/properties/update", "PATCH", body);
    expect(response.status).toBe(400);
    expect(services.properties.updateDraft).not.toHaveBeenCalled();
  });

  it.each(["media", "mediaIds", "corePhotos"] as const)(
    "rejects malformed UUIDs in every %s media array before publishing",
    async (field) => {
      const response = await request("/admin/publishing/material-edit", "PATCH", {
        [field]: ["not-a-uuid"],
      });
      expect(response.status).toBe(400);
      expect(services.publishing.createMaterialEditReview).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed ownership and conversion references before service invocation", async () => {
    const ownership = await request("/admin/publishing/ownership-change", "PATCH", {
      newOwnerId: "not-a-uuid",
    });
    const conversion = await request("/owner/conversions", "POST", {
      inquiryId: "not-a-uuid",
      firstPaymentAmount: "100",
      firstPaymentCurrency: "KES",
    });

    expect(ownership.status).toBe(400);
    expect(conversion.status).toBe(400);
    expect(services.publishing.reverifyOwnershipChange).not.toHaveBeenCalled();
    expect(services.conversions.report).not.toHaveBeenCalled();
  });

  it.each(["propertyId", "offeringId"] as const)(
    "rejects malformed inquiry %s before service invocation",
    async (field) => {
      const response = await request("/public/inquiries", "POST", {
        propertyId: field === "propertyId" ? "not-a-uuid" : UUID,
        offeringId: field === "offeringId" ? "not-a-uuid" : UUID,
        mode: "SHORT_STAY",
        name: "Guest",
        email: "guest@example.com",
        phone: "+254700000000",
        message: "Interested",
      });
      expect(response.status).toBe(400);
      expect(services.inquiries.create).not.toHaveBeenCalled();
    },
  );

  it.each(["propertyId", "inspectionId"] as const)(
    "rejects malformed media upload %s before service invocation",
    async (field) => {
      const response = await request("/media/upload", "POST", {
        purpose: "LISTING",
        [field]: "not-a-uuid",
      });
      expect(response.status).toBe(400);
      expect(services.media.createUploadTarget).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed verifier and nested inspection evidence references", async () => {
    const assign = await request("/verification/assign", "POST", { verifierId: "not-a-uuid" });
    const submit = await request("/verification/submit", "POST", {
      checklist: {},
      evidence: [{ mediaId: "not-a-uuid" }],
    });
    expect(assign.status).toBe(400);
    expect(submit.status).toBe(400);
    expect(services.inspections.assign).not.toHaveBeenCalled();
    expect(services.inspections.submit).not.toHaveBeenCalled();
  });

  it("rejects malformed availability property references", async () => {
    const response = await request("/owner/availability/unavailable", "POST", {
      propertyId: "not-a-uuid",
      startDate: "2026-12-01",
      endDate: "2026-12-02",
    });
    expect(response.status).toBe(400);
    expect(services.availability.create).not.toHaveBeenCalled();
  });

  it("accepts valid UUID references and invokes the service", async () => {
    const property = await request("/owner/properties/update", "PATCH", {
      countryCode: "KE",
      countryId: UUID,
      cityId: UUID,
      neighborhoodId: UUID,
    });
    const media = await request("/admin/publishing/material-edit", "PATCH", {
      media: [UUID],
      mediaIds: [UUID],
      corePhotos: [UUID],
    });
    const ownership = await request("/admin/publishing/ownership-change", "PATCH", {
      newOwnerId: UUID,
    });
    const conversion = await request("/owner/conversions", "POST", {
      inquiryId: UUID,
      firstPaymentAmount: "100",
      firstPaymentCurrency: "KES",
    });
    const inquiry = await request("/public/inquiries", "POST", {
      propertyId: UUID,
      offeringId: UUID,
      mode: "SHORT_STAY",
      name: "Guest",
      email: "guest@example.com",
      phone: "+254700000000",
      message: "Interested",
    });
    const upload = await request("/media/upload", "POST", {
      purpose: "LISTING",
      propertyId: UUID,
      inspectionId: UUID,
    });
    const assign = await request("/verification/assign", "POST", { verifierId: UUID });
    const submit = await request("/verification/submit", "POST", {
      checklist: {},
      evidence: [{ mediaId: UUID }],
    });
    const unavailable = await request("/owner/availability/unavailable", "POST", {
      propertyId: UUID,
      startDate: "2026-12-01",
      endDate: "2026-12-02",
    });

    expect(property.status).toBe(200);
    expect(media.status).toBe(200);
    expect(ownership.status).toBe(200);
    expect(conversion.status).toBe(201);
    expect(inquiry.status).toBe(201);
    expect(upload.status).toBe(201);
    expect(assign.status).toBe(201);
    expect(submit.status).toBe(201);
    expect(unavailable.status).toBe(201);
    expect(services.properties.updateDraft).toHaveBeenCalled();
    expect(services.publishing.createMaterialEditReview).toHaveBeenCalled();
    expect(services.publishing.reverifyOwnershipChange).toHaveBeenCalled();
    expect(services.conversions.report).toHaveBeenCalled();
    expect(services.inquiries.create).toHaveBeenCalled();
    expect(services.media.createUploadTarget).toHaveBeenCalled();
    expect(services.inspections.assign).toHaveBeenCalled();
    expect(services.inspections.submit).toHaveBeenCalled();
    expect(services.availability.create).toHaveBeenCalled();
  });
});
