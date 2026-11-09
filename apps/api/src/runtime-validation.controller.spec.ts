import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { CommissionsController } from "./commissions/commissions.controller";
import {
  ConversionReportDto,
  VerifyEvidenceDto,
} from "./commissions/commissions.controller";
import {
  AdminInquiriesController,
  OwnerInquiriesController,
} from "./inquiries/inquiries.controller";
import { PropertiesController } from "./properties/properties.controller";
import { CreatePropertyDto, UpdatePropertyDto } from "./properties/dto";
import { AdminLocationReleaseDto } from "./inquiries/inquiries.controller";
import {
  MaterialEditDto,
  PublishingController,
} from "./properties/publishing.controller";

describe("runtime mutation boundaries", () => {
  it("accepts the established property and conversion contract fields", async () => {
    const propertyErrors = await validate(
      plainToInstance(CreatePropertyDto, {
        title: "A home",
        description: "A description",
        countryCode: "KE",
        cityId: "city-1",
        category: "residential",
        publicLocation: { label: "Kilimani", latitude: -1.2, longitude: 36.8 },
        exactLocation: {
          address: "Private",
          latitude: -1.21,
          longitude: 36.81,
        },
        authorizationAttested: true,
        offerings: [
          {
            mode: "SHORT_STAY",
            currency: "KES",
            basePrice: 1000,
            minimumNights: 1,
          },
        ],
      }),
    );
    expect(propertyErrors).toEqual([]);

    const conversionErrors = await validate(
      plainToInstance(ConversionReportDto, {
        inquiryId: "inquiry-1",
        firstPaymentAmount: "1000.00",
        firstPaymentCurrency: "KES",
        paymentEvidence: "receipt-ref",
      }),
    );
    expect(conversionErrors).toEqual([]);
  });

  it("rejects unknown and malformed nested fields with DTO validation", async () => {
    const propertyErrors = await validate(
      plainToInstance(CreatePropertyDto, {
        title: "A home",
        description: "A description",
        countryCode: "KE",
        cityId: "city-1",
        category: "residential",
        publicLocation: {
          label: "Kilimani",
          latitude: -1.2,
          longitude: 36.8,
          unknown: true,
        },
        exactLocation: {
          address: "Private",
          latitude: -1.21,
          longitude: 36.81,
        },
        offerings: [{ mode: "SHORT_STAY", currency: "KES", basePrice: 1000 }],
        unexpected: true,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(propertyErrors.length).toBeGreaterThan(0);

    const updateErrors = await validate(
      plainToInstance(UpdatePropertyDto, { publicLocation: null }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(updateErrors.length).toBeGreaterThan(0);

    const materialErrors = await validate(
      plainToInstance(MaterialEditDto, {
        exactLocation: { address: "Private", unknown: true },
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(materialErrors.length).toBeGreaterThan(0);

    const reportErrors = await validate(
      plainToInstance(ConversionReportDto, {
        inquiryId: "inquiry-1",
        firstPaymentAmount: "1e3",
        firstPaymentCurrency: "KES",
        unknown: true,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(reportErrors.length).toBeGreaterThan(0);

    const evidenceErrors = await validate(
      plainToInstance(VerifyEvidenceDto, { approved: "yes" }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(evidenceErrors.length).toBeGreaterThan(0);

    const inquiryErrors = await validate(
      plainToInstance(AdminLocationReleaseDto, {
        reason: "Review",
        extra: true,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(inquiryErrors.length).toBeGreaterThan(0);
  });

  it("rejects null property payloads before reaching the service", async () => {
    const propertiesService = { createDraft: vi.fn(), updateDraft: vi.fn() };
    const properties = new PropertiesController(
      propertiesService as never,
      {} as never,
    );

    expect(() =>
      properties.create({ user: { id: "owner-1" } }, null as never),
    ).toThrow(BadRequestException);
    expect(() =>
      properties.update({ user: { id: "owner-1" } }, "property-1", {
        publicLocation: null,
      } as never),
    ).toThrow(BadRequestException);
    expect(propertiesService.createDraft).not.toHaveBeenCalled();
    expect(propertiesService.updateDraft).not.toHaveBeenCalled();
  });

  it("rejects null publishing and translation payloads before reaching services", async () => {
    const publishingService = {
      reportFraud: vi.fn(),
      createMaterialEditReview: vi.fn(),
      reverifyOwnershipChange: vi.fn(),
    };
    const translations = { upsertApprovedTranslation: vi.fn() };
    const publishing = new PublishingController(
      publishingService as never,
      translations as never,
    );

    expect(() =>
      publishing.fraud(
        { user: { id: "admin-1" } },
        "property-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      publishing.materialEdit(
        { user: { id: "admin-1" } },
        "property-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      publishing.ownershipChange(
        { user: { id: "admin-1", roles: ["ADMIN"] } },
        "property-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      publishing.approveTranslation(
        { user: { id: "admin-1" } },
        "property-1",
        "ti",
        null as never,
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects null conversion and evidence payloads before reaching services", async () => {
    const conversions = { report: vi.fn(), verifyEvidence: vi.fn() };
    const commissions = new CommissionsController(
      {} as never,
      conversions as never,
    );

    expect(() =>
      commissions.report({ user: { id: "owner-1" } }, null as never),
    ).toThrow(BadRequestException);
    expect(() =>
      commissions.verify(
        { user: { id: "admin-1" } },
        "conversion-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
    expect(conversions.report).not.toHaveBeenCalled();
    expect(conversions.verifyEvidence).not.toHaveBeenCalled();
  });

  it("rejects null admin inquiry payloads before reaching the service", async () => {
    const service = { adminReleaseLocation: vi.fn(), revokeLocation: vi.fn() };
    const inquiries = new AdminInquiriesController(service as never);

    expect(() =>
      inquiries.release(
        { user: { id: "admin-1", roles: ["ADMIN"] } },
        "inquiry-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      inquiries.revoke(
        { user: { id: "admin-1", roles: ["ADMIN"] } },
        "inquiry-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects null owner inquiry responses before reaching the service", async () => {
    const service = { ownerRespond: vi.fn() };
    const inquiries = new OwnerInquiriesController(service as never);

    expect(() =>
      inquiries.respond(
        { user: { id: "owner-1" } },
        "inquiry-1",
        null as never,
      ),
    ).toThrow(BadRequestException);
    expect(service.ownerRespond).not.toHaveBeenCalled();
  });
});
