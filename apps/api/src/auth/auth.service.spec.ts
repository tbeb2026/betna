import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { OtpService, WhatsAppProvider } from "./otp.service";
import { SessionService } from "./session.service";
import { AuditService } from "../audit/audit.service";

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
    const audit = new AuditService({ auditEvent: { create } });

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
});
