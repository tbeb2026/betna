import { describe, expect, it, vi } from "vitest";
import { OtpService, WhatsAppProvider } from "./otp.service";

describe("OtpService persistence", () => {
  it("persists a challenge, counts persisted requests, and atomically consumes it", async () => {
    let row: any;
    let sentCode = "";
    const provider: WhatsAppProvider = {
      sendOtp: vi.fn(async (_phone, code) => { sentCode = code; }),
    };
    const prisma = {
      otpChallenge: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: any) => { row = { ...data, attempts: 0, consumedAt: null }; return row; }),
        findFirst: vi.fn(async () => row),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (where.id !== row.id || row.consumedAt || row.attempts >= where.attempts.lt) return { count: 0 };
          row.attempts += data.attempts.increment;
          if (data.consumedAt) row.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
      },
    };
    const service = new OtpService(prisma as never, { provider, maxAttempts: 2 });

    await service.request("+254700000010");
    await expect(service.verify("+254700000010", "000000")).rejects.toThrow(/invalid/i);
    await expect(service.verify("+254700000010", sentCode)).resolves.toBe(true);

    expect(prisma.otpChallenge.count).toHaveBeenCalled();
    expect(prisma.otpChallenge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ phone: "+254700000010" }) });
    expect(prisma.otpChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ attempts: { lt: 2 }, consumedAt: null }),
      data: expect.objectContaining({ attempts: { increment: 1 } }),
    }));
  });

  it("removes a persisted challenge when the WhatsApp provider fails", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({ id: "otp-1" });
    const provider: WhatsAppProvider = { sendOtp: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    const prisma = { otpChallenge: { count: vi.fn().mockResolvedValue(0), create, delete: remove } };
    const service = new OtpService(prisma as never, { provider });

    await expect(service.request("+254700000011")).rejects.toThrow(/provider/i);
    expect(remove).toHaveBeenCalledWith({ where: { id: expect.any(String) } });
  });

  it("enforces the attempt cap when invalid verifications race", async () => {
    let row: any;
    const provider: WhatsAppProvider = { sendOtp: vi.fn() };
    const prisma = {
      otpChallenge: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(async ({ data }: any) => { row = { ...data, attempts: 0, consumedAt: null }; return row; }),
        findFirst: vi.fn(async () => row),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (row.id !== where.id || row.consumedAt || row.attempts >= where.attempts.lt) return { count: 0 };
          row.attempts += data.attempts.increment;
          if (data.consumedAt) row.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
      },
    };
    const service = new OtpService(prisma as never, { provider, maxAttempts: 2 });
    await service.request("+254700000012");

    const results = await Promise.allSettled([
      service.verify("+254700000012", "000000"),
      service.verify("+254700000012", "000000"),
      service.verify("+254700000012", "000000"),
    ]);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(row.attempts).toBe(2);
    expect(row.consumedAt).toBeTruthy();
  });
});
