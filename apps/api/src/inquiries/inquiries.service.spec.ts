import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { InquiriesService } from "./inquiries.service";

const property = {
  id: "property-1",
  ownerId: "owner-1",
  status: "PUBLISHED",
  publicLocationLabel: "Kilimani, Nairobi",
  publicLatitude: -1.2921,
  publicLongitude: 36.8219,
  exactAddress: "12 Private Lane",
  exactLatitude: -1.2922,
  exactLongitude: 36.822,
  owner: {
    id: "owner-1",
    email: "owner@example.com",
    phone: "+254700000001",
  },
  offerings: [{ id: "offering-1", mode: "SHORT_STAY" }],
};

function makePrisma() {
  const inquiries: any[] = [];
  const auditEvent = { create: vi.fn().mockResolvedValue({ id: "audit-1" }) };
  const prisma: any = {
    property: {
      findUnique: vi.fn().mockResolvedValue(property),
    },
    inquiry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(async ({ where }: any) =>
        inquiries.find((item) => item.id === where.id) ?? null,
      ),
      findMany: vi.fn(async () => inquiries),
      create: vi.fn(async ({ data }: any) => {
        const inquiry = {
          id: `inquiry-${inquiries.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          property,
        };
        inquiries.push(inquiry);
        return inquiry;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const inquiry = inquiries.find((item) => item.id === where.id);
        Object.assign(inquiry, data);
        return inquiry;
      }),
    },
    contactClick: { create: vi.fn() },
    auditEvent,
    $transaction: vi.fn(async (callback: any) => callback(prisma)),
  };
  return { prisma, inquiries, auditEvent };
}

describe("InquiriesService", () => {
  it("accepts a guest inquiry without an account and notifies owner and Betna", async () => {
    const { prisma } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new InquiriesService(prisma, { enqueue } as any);

    const result = await service.createGuestInquiry({
      propertyId: "property-1",
      offeringId: "offering-1",
      mode: "SHORT_STAY",
      name: "Amina Guest",
      email: "amina@example.com",
      phone: "+254711111111",
      message: "Can I visit this weekend?",
      guests: 2,
    });

    expect(result.inquiry).toMatchObject({
      status: "NEW",
    });
    expect(result).toMatchObject({
      location: { label: "Kilimani, Nairobi", latitude: -1.2921 },
    });
    expect(result).not.toHaveProperty("location.exactAddress");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "INQUIRY_CREATED",
        recipients: expect.arrayContaining([
          expect.objectContaining({ userId: "owner-1" }),
          expect.objectContaining({ email: "amina@example.com" }),
        ]),
      }),
    );
  });

  it("does not disclose exact location until an admin releases it", async () => {
    const { prisma, inquiries } = makePrisma();
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Amina Guest",
      email: "second@example.com",
      phone: "+254711111112",
      message: "I would like more details.",
    });

    expect(created.location).not.toHaveProperty("exactAddress");
    await expect(
      service.adminReleaseLocation(created.inquiry.id, {
        id: "owner-1",
        roles: ["OWNER"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const released = await service.adminReleaseLocation(created.inquiry.id, {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    expect(released).toMatchObject({
      inquiry: { status: "LOCATION_APPROVED" },
      location: { exactAddress: "12 Private Lane", latitude: -1.2922 },
    });
    expect(inquiries[0].locationApprovedAt).toEqual(expect.any(Date));
  });

  it("logs a prefilled contact click without exposing conversation contents", async () => {
    const { prisma } = makePrisma();
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);

    const result = await service.logContactClick({
      propertyId: "property-1",
      target: "BETNA",
      channel: "WHATSAPP",
    });

    expect(result).toMatchObject({ propertyId: "property-1", target: "BETNA", channel: "WHATSAPP" });
    expect(prisma.contactClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        propertyId: "property-1",
        target: "BETNA",
        channel: "WHATSAPP",
      }),
    });
  });

  it("lets the owner confirm or decline a pending inquiry and rejects invalid transitions", async () => {
    const { prisma, inquiries } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new InquiriesService(prisma, { enqueue } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Amina Guest",
      email: "owner-response@example.com",
      phone: "+254711111113",
      message: "Please confirm availability.",
    });

    await expect(service.ownerRespond(created.inquiry.id, "owner-1", { decision: "CONFIRMED" })).resolves.toMatchObject({
      status: "OWNER_CONFIRMED",
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: "INQUIRY_OWNER_CONFIRMED" }));
    await expect(service.ownerRespond(created.inquiry.id, "owner-1", { decision: "DECLINED" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.ownerRespond(inquiries[0].id, "owner-1", { decision: "MAYBE" } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lets the owner confirm an inquiry after an admin approves its location", async () => {
    const { prisma, inquiries } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const availability = {
      confirmInquiryAndBlockDates: vi.fn(async (id: string) => {
        const inquiry = inquiries.find((row) => row.id === id);
        inquiry.status = "OWNER_CONFIRMED";
        return { inquiry, blocked: true, declinedInquiryIds: [] };
      }),
    };
    const service = new InquiriesService(prisma, { enqueue } as any, undefined, undefined, availability as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Location Guest",
      email: "location-owner-response@example.com",
      phone: "+254711111130",
      message: "Please confirm after location review.",
      startDate: "2026-12-10",
      endDate: "2026-12-12",
    });
    inquiries[0].status = "LOCATION_APPROVED";

    await expect(service.ownerRespond(created.inquiry.id, "owner-1", { decision: "CONFIRMED" }))
      .resolves.toMatchObject({ status: "OWNER_CONFIRMED" });
    expect(availability.confirmInquiryAndBlockDates).toHaveBeenCalledWith(created.inquiry.id, "owner-1");
  });

  it("requires both dates and a non-empty interval for short-stay inquiries", async () => {
    const { prisma } = makePrisma();
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    await expect(service.createGuestInquiry({
      propertyId: "property-1", mode: "SHORT_STAY", name: "Date Guest", email: "date-one@example.com", phone: "+254711111131", message: "Dates", startDate: "2026-12-10",
    })).rejects.toThrow(/both.*date|endDate/i);
    await expect(service.createGuestInquiry({
      propertyId: "property-1", mode: "SHORT_STAY", name: "Date Guest", email: "date-two@example.com", phone: "+254711111132", message: "Dates", startDate: "2026-12-12", endDate: "2026-12-10",
    })).rejects.toThrow(/endDate/i);
  });

  it("requires a published property and an eligible owner for contact-click logging", async () => {
    const { prisma } = makePrisma();
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    prisma.property.findUnique.mockResolvedValueOnce({ ...property, status: "PAUSED" });
    await expect(service.logContactClick({ propertyId: "property-1", target: "BETNA", channel: "WHATSAPP" })).rejects.toThrow("Published property");
    prisma.property.findUnique.mockResolvedValueOnce({ ...property, owner: null });
    await expect(service.logContactClick({ propertyId: "property-1", target: "OWNER", channel: "WHATSAPP" })).rejects.toThrow("owner contact");
  });

  it("makes an approved location idempotent, expires it, and supports admin revocation", async () => {
    const { prisma, inquiries } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new InquiriesService(prisma, { enqueue } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Amina Guest",
      email: "location-release@example.com",
      phone: "+254711111114",
      message: "Please release the address.",
    });
    const actor = { id: "admin-1", roles: ["ADMIN"] };
    const first = await service.adminReleaseLocation(created.inquiry.id, actor, "Verified inquiry");
    const second = await service.adminReleaseLocation(created.inquiry.id, actor, "Duplicate request");
    expect(first).toMatchObject({ inquiry: { status: "LOCATION_APPROVED" } });
    expect(second).toMatchObject({ inquiry: { status: "LOCATION_APPROVED" }, idempotent: true });
    expect(enqueue.mock.calls.filter(([event]) => event.type === "INQUIRY_LOCATION_APPROVED")).toHaveLength(2);

    inquiries[0].locationReleaseExpiresAt = new Date(Date.now() - 1);
    await expect(service.getReleasedLocation(created.inquiry.id, actor)).resolves.toBeNull();
    expect(inquiries[0].status).toBe("CONTACTED");
    await service.adminReleaseLocation(created.inquiry.id, actor);
    await service.revokeLocation(created.inquiry.id, actor, "Guest withdrew request");
    await expect(service.getReleasedLocation(created.inquiry.id, actor)).resolves.toBeNull();
    expect(inquiries[0].status).toBe("CONTACTED");
  });

  it("serializes concurrent location releases and emits one approval event", async () => {
    const { prisma } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new InquiriesService(prisma, { enqueue } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Concurrent Guest",
      email: "concurrent-release@example.com",
      phone: "+254711111115",
      message: "Please release the address.",
    });
    const actor = { id: "admin-1", roles: ["ADMIN"] };

    await Promise.all([
      service.adminReleaseLocation(created.inquiry.id, actor),
      service.adminReleaseLocation(created.inquiry.id, actor),
    ]);

    expect(enqueue.mock.calls.filter(([event]) => event.type === "INQUIRY_LOCATION_APPROVED")).toHaveLength(2);
  });

  it("does not disclose a legacy approved release with no expiry", async () => {
    const { prisma, inquiries } = makePrisma();
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Legacy Guest",
      email: "legacy-release@example.com",
      phone: "+254711111116",
      message: "Please release the address.",
    });
    inquiries[0].status = "LOCATION_APPROVED";
    inquiries[0].locationReleaseExpiresAt = null;

    await expect(service.getReleasedLocation(created.inquiry.id, { id: "admin-1", roles: ["ADMIN"] })).resolves.toBeNull();
    expect(inquiries[0].status).toBe("CONTACTED");
  });

  it("uses a distinct notification key when an expired release is renewed", async () => {
    const { prisma, inquiries } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new InquiriesService(prisma, { enqueue } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Renewal Guest",
      email: "renewal-release@example.com",
      phone: "+254711111117",
      message: "Please release the address.",
    });
    const actor = { id: "admin-1", roles: ["ADMIN"] };
    await service.adminReleaseLocation(created.inquiry.id, actor);
    inquiries[0].locationReleaseExpiresAt = new Date(Date.now() - 1);
    await service.adminReleaseLocation(created.inquiry.id, actor);

    const keys = enqueue.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "INQUIRY_LOCATION_APPROVED")
      .map((event) => event.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("returns BadRequestException for malformed runtime input instead of throwing TypeError", async () => {
    const { prisma } = makePrisma();
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    await expect(service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Malformed Guest",
      email: "malformed@example.com",
      phone: "+254711111118",
      message: "hello",
      honeypot: 42 as any,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.logContactClick({ propertyId: 42 as any, target: "BETNA", channel: "WHATSAPP" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adminReleaseLocation("missing", { id: "admin-1", roles: ["ADMIN"] }, 42 as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("consumes the persisted rate limit atomically under concurrent submissions", async () => {
    const { prisma } = makePrisma();
    const attempts = new Map<string, number>();
    (prisma as any).inquiryAbuseAttempt = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn(async ({ where }: any) => {
        const key = where?.key;
        const count = key ? attempts.get(key) ?? 0 : 0;
        return count ? { key, attempts: count, windowStartedAt: new Date(), lastAttemptAt: new Date() } : null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const count = attempts.get(where.key) ?? 0;
        const next = count ? count + 1 : create.attempts;
        attempts.set(where.key, next);
        return { ...create, ...update, key: where.key, attempts: next };
      }),
    };
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    const input = {
      propertyId: "property-1",
      mode: "SHORT_STAY" as const,
      name: "Rate Limited Guest",
      email: "atomic-rate-limit@example.com",
      phone: "+254711111119",
      message: "hello",
    };
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => service.createGuestInquiry(input)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof ConflictException)).toHaveLength(2);
  });

  it("uses a database atomic upsert for rate-limit creation and window reset", async () => {
    const { prisma } = makePrisma();
    const attempts = new Map<string, number>();
    prisma.inquiryAbuseAttempt = undefined;
    prisma.$queryRaw = vi.fn(async (query: any) => {
      const key = String(query?.values?.[0] ?? "unknown");
      const next = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, next);
      return [{ attempts: next }];
    });
    const service = new InquiriesService(prisma, { enqueue: vi.fn() } as any);
    await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Raw SQL Guest",
      email: "raw-sql-rate@example.com",
      phone: "+254711111120",
      message: "hello",
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw.mock.calls[0][0].strings?.join(" ")).toContain("ON CONFLICT");
    expect(prisma.$queryRaw.mock.calls[0][0].strings?.join(" ")).toContain("RETURNING");
  });

  it("recovers a failed release notification on a later idempotent release call", async () => {
    const { prisma } = makePrisma();
    const enqueue = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(undefined);
    const service = new InquiriesService(prisma, { enqueue } as any);
    const created = await service.createGuestInquiry({
      propertyId: "property-1",
      mode: "SHORT_STAY",
      name: "Recovery Guest",
      email: "release-recovery@example.com",
      phone: "+254711111121",
      message: "Please release the address.",
    });
    const actor = { id: "admin-1", roles: ["ADMIN"] };

    await expect(service.adminReleaseLocation(created.inquiry.id, actor)).rejects.toThrow("provider unavailable");
    await service.adminReleaseLocation(created.inquiry.id, actor);

    const releaseEvents = enqueue.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "INQUIRY_LOCATION_APPROVED");
    expect(releaseEvents).toHaveLength(2);
    expect(releaseEvents[0].idempotencyKey).toBe(releaseEvents[1].idempotencyKey);
  });
});
