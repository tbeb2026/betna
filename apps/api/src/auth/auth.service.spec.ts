import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { OtpError, OtpService, WhatsAppProvider } from "./otp.service";
import { SessionService } from "./session.service";
import { AuditService } from "../audit/audit.service";
import { TerritoryScoped, TerritoryScopedGuard } from "./guards";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

const user = {
  id: "user-1",
  email: "owner@example.com",
  phone: "+254700000001",
  passwordHash: "",
  status: "ACTIVE",
  roles: [{ role: { name: "OWNER" } }],
};

describe("AuthService", () => {
  it("requests an owner WhatsApp OTP through the configured OTP provider", async () => {
    const request = vi.fn().mockResolvedValue({ expiresAt: new Date() });
    const auth = new AuthService({} as never, { request } as never);

    await auth.requestOwnerPhoneOtp("+254 700 000 001");

    expect(request).toHaveBeenCalledWith("+254700000001");
  });

  it("rate limits repeated owner email verification requests", async () => {
    const notifications = { enqueue: vi.fn().mockResolvedValue([]) };
    const auth = new AuthService({} as never, undefined, undefined, notifications as never);

    await auth.requestOwnerEmailVerification("rate-limited@example.com");
    await auth.requestOwnerEmailVerification("rate-limited@example.com");
    await auth.requestOwnerEmailVerification("rate-limited@example.com");

    await expect(
      auth.requestOwnerEmailVerification("rate-limited@example.com"),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("does not report email verification as sent when the notification boundary fails", async () => {
    const auth = new AuthService(
      {} as never,
      undefined,
      undefined,
      { enqueue: vi.fn().mockResolvedValue([{ status: "FAILED", error: "provider unavailable" }]) } as never,
    );

    await expect(auth.requestOwnerEmailVerification("delivery@example.com"))
      .rejects.toThrow(/email.*deliver/i);
  });

  it("does not create an email challenge while durable delivery is still processing", async () => {
    const create = vi.fn();
    const auth = new AuthService(
      { emailVerificationChallenge: { create } } as never,
      undefined,
      undefined,
      { enqueue: vi.fn().mockResolvedValue([{ status: "PROCESSING" }]) } as never,
    );

    await expect(auth.requestOwnerEmailVerification("processing@example.com"))
      .rejects.toThrow(/email.*deliver/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("persists email challenges and atomically caps confirmation attempts", async () => {
    let row: any;
    let sentCode = "";
    const store = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }: any) => { row = { ...data, attempts: 0, consumedAt: null, confirmedAt: null }; return row; }),
      findFirst: vi.fn(async () => row),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!row || row.id !== where.id || row.consumedAt || row.attempts >= where.attempts.lt) return { count: 0 };
        row.attempts += data.attempts.increment;
        if (data.confirmedAt) row.confirmedAt = data.confirmedAt;
        if (data.consumedAt) row.consumedAt = data.consumedAt;
        return { count: 1 };
      }),
    };
    const auth = new AuthService(
      { emailVerificationChallenge: store } as never,
      undefined,
      undefined,
      { enqueue: vi.fn(async (event: { body?: string }) => { sentCode = event.body?.match(/\b\d{6}\b/)?.[0] ?? ""; return [{ status: "SENT" }]; }) } as never,
    );

    await auth.requestOwnerEmailVerification("persisted@example.com");
    await expect(auth.confirmOwnerEmailVerification("persisted@example.com", "000000"))
      .rejects.toThrow(/invalid/i);
    await expect(auth.confirmOwnerEmailVerification("persisted@example.com", sentCode))
      .resolves.toEqual({ verified: true });

    expect(store.count).toHaveBeenCalled();
    expect(store.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "persisted@example.com" }) });
    expect(store.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ consumedAt: null, attempts: { lt: 5 } }),
    }));
  });

  it("does not activate an owner until email verification is confirmed", async () => {
    let sentEmail = "";
    const otp = {
      verify: vi.fn().mockResolvedValue(true),
    };
    const notifications = {
      enqueue: vi.fn().mockImplementation(async (event: { body?: string }) => {
        sentEmail = event.body ?? "";
      }),
    };
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: { email: string; phone: string; roles: unknown } }) => ({
          ...user,
          email: data.email,
          phone: data.phone,
          emailVerified: true,
          phoneVerified: true,
          authorizationAttested: true,
          roles: [{ role: { name: "OWNER" } }],
        })),
      },
      role: { findUnique: vi.fn().mockResolvedValue({ id: "owner-role" }) },
    };
    const auth = new AuthService(prisma as never, otp as never, undefined, notifications as never);

    await expect(
      auth.onboardOwner({
        email: "new-owner@example.com",
        password: "secret123",
        phone: "+254700000002",
        firstName: "New",
        lastName: "Owner",
        otpCode: "123456",
        authorizationAttested: true,
      }),
    ).rejects.toThrow(/email.*verif/i);

    await auth.requestOwnerEmailVerification("new-owner@example.com");
    const emailCode = sentEmail.match(/\b\d{6}\b/)?.[0];
    expect(emailCode).toBeTruthy();
    const result = await auth.onboardOwner({
      email: "new-owner@example.com",
      password: "secret123",
      phone: "+254700000002",
      firstName: "New",
      lastName: "Owner",
      otpCode: "123456",
      emailVerificationCode: emailCode,
      authorizationAttested: true,
    });

    expect(result.user.email).toBe("new-owner@example.com");
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "ACTIVE",
        emailVerified: true,
        phoneVerified: true,
        authorizationAttested: true,
      }),
    }));
  });

  it("denies a suspended password account", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...user, status: "SUSPENDED" }),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.signInWithPassword("owner@example.com", "secret"),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it("limits repeated OTP requests for one phone number", async () => {
    const provider: WhatsAppProvider = {
      sendOtp: vi.fn().mockResolvedValue(undefined),
    };
    const otp = new OtpService({ provider, maxRequests: 1, windowMs: 60_000 });

    await otp.request("+254700000001");
    await expect(otp.request("+254700000001")).rejects.toMatchObject({
      status: 429,
    });
    expect(provider.sendOtp).toHaveBeenCalledTimes(1);
  });

  it("revokes a session and rejects it afterwards", async () => {
    const sessions = new SessionService({ ttlMs: 60_000 });
    const session = await sessions.create(user.id, ["OWNER"]);

    expect(await sessions.validate(session.token)).toMatchObject({
      userId: user.id,
    });
    await sessions.revoke(session.token);
    await expect(sessions.validate(session.token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("signs in with a password without requiring MFA", async () => {
    const passwordHash = await AuthService.hashPassword("secret123");
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...user, passwordHash }),
      },
    };
    const auth = new AuthService(prisma as never);

    const result = await auth.signInWithPassword(
      "owner@example.com",
      "secret123",
    );

    expect(result.user.id).toBe(user.id);
    expect(result.session.token).toEqual(expect.any(String));
  });

  it("records an exact-location release as an append-only audit event", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-1" });
    const audit = new AuditService({ auditEvent: { create } } as never);

    await audit.record({ id: "admin-1" }, "EXACT_LOCATION_RELEASED", {
      type: "Inquiry",
      id: "inquiry-1",
      metadata: { reason: "verified inquiry" },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: "admin-1",
        action: "EXACT_LOCATION_RELEASED",
        entityType: "Inquiry",
        entityId: "inquiry-1",
        metadata: { reason: "verified inquiry" },
      },
    });
  });

  it("invokes WhatsApp, expires OTPs, and locks after maximum attempts", async () => {
    let sentCode = "";
    const provider: WhatsAppProvider = {
      sendOtp: vi.fn().mockImplementation(async (_phone, code) => {
        sentCode = code;
      }),
    };
    const otp = new OtpService({ provider, codeTtlMs: 1, maxAttempts: 2 });

    await otp.request("+254700000001");
    expect(provider.sendOtp).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(otp.verify("+254700000001", sentCode)).rejects.toMatchObject({
      status: 401,
    });

    const longer = new OtpService({ provider, maxAttempts: 2 });
    const oldCode = sentCode;
    await longer.request("+254700000002");
    await expect(
      longer.verify("+254700000002", "000000"),
    ).rejects.toBeInstanceOf(OtpError);
    await expect(
      longer.verify("+254700000002", "000000"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(longer.verify("+254700000002", oldCode)).rejects.toMatchObject(
      { status: 401 },
    );
  });

  it("rejects an expired session", async () => {
    const sessions = new SessionService({ ttlMs: 1 });
    const session = await sessions.create(user.id, ["OWNER"]);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(sessions.validate(session.token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("allows only assigned territories unless the user is an admin", () => {
    class TerritoryController {
      inspect() {
        return true;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      TerritoryController.prototype,
      "inspect",
    )!;
    TerritoryScoped()(TerritoryController.prototype, "inspect", descriptor);
    const guard = new TerritoryScopedGuard();
    const context = (request: any) => ({
      getHandler: () => descriptor.value,
      getClass: () => TerritoryController,
      switchToHttp: () => ({ getRequest: () => request }),
    });

    expect(
      guard.canActivate(
        context({
          user: { roles: ["VERIFIER"], territoryIds: ["t-1"] },
          params: { territoryId: "t-1" },
        }) as never,
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        context({
          user: { roles: ["VERIFIER"], territoryIds: ["t-1"] },
          params: { territoryId: "t-2" },
        }) as never,
      ),
    ).toBe(false);
    expect(
      guard.canActivate(
        context({
          user: { roles: ["ADMIN"], territoryIds: [] },
          params: { territoryId: "t-2" },
        }) as never,
      ),
    ).toBe(true);
  });

  it("boots the Nest module graph with typed Prisma injection", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });

  it("loads persisted territory assignments into a new session", async () => {
    const passwordHash = await AuthService.hashPassword("secret123");
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          ...user,
          passwordHash,
          territoryAssignments: [{ territoryId: "territory-1" }],
        }),
      },
    };
    const auth = new AuthService(prisma as never);

    const result = await auth.signInWithPassword(
      "owner@example.com",
      "secret123",
    );

    expect(result.session.territoryIds).toEqual(["territory-1"]);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          territoryAssignments: { select: { territoryId: true } },
        }),
      }),
    );
  });
});
