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
