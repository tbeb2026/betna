import { describe, expect, it, vi } from "vitest";
import { NotificationEvent, NotificationService } from "./notifications.service";
import { ChannelAdapter } from "./channel.adapter";

describe("NotificationService", () => {
  it("does not send from the unique-key loser across service instances", async () => {
    const rows = new Map<string, any>();
    let firstSendStarted!: () => void;
    const firstSend = new Promise<void>((resolve) => { firstSendStarted = resolve; });
    const sendsOne = vi.fn().mockImplementation(() => firstSend);
    const sendsTwo = vi.fn().mockResolvedValue(undefined);
    const store = {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.idempotencyKey) ?? null),
      create: vi.fn(async ({ data }: any) => {
        if (rows.has(data.idempotencyKey)) throw new Error("Unique constraint failed");
        const row = { id: `notification-${rows.size + 1}`, ...data };
        rows.set(row.idempotencyKey, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = [...rows.values()].find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = [...rows.values()].find((item) => item.id === where.id && ["FAILED", "QUEUED"].includes(item.status));
        if (!row) return { count: 0 };
        Object.assign(row, data, { attempts: (row.attempts ?? 0) + 1 });
        return { count: 1 };
      }),
    };
    const event: NotificationEvent = {
      type: "INQUIRY_CREATED",
      inquiryId: "inquiry-race",
      recipients: [{ email: "race@example.com" }],
      channels: ["EMAIL"],
    };
    const one = new NotificationService({ notification: store } as any, [{ channel: "EMAIL", send: sendsOne }]);
    const two = new NotificationService({ notification: store } as any, [{ channel: "EMAIL", send: sendsTwo }]);

    const first = one.enqueue(event);
    await vi.waitFor(() => expect(sendsOne).toHaveBeenCalledTimes(1));
    await two.enqueue(event);
    expect(sendsTwo).not.toHaveBeenCalled();
    firstSendStarted();
    await first;
  });

  it("claims persisted failed rows for a durable retry worker", async () => {
    const row: any = {
      id: "notification-retry",
      idempotencyKey: "retry-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "FAILED",
      recipientEmail: "retry-worker@example.com",
      recipientPhone: null,
      recipientId: null,
      inquiryId: "inquiry-worker",
      payload: {},
      attempts: 1,
    };
    const sends = vi.fn().mockResolvedValue(undefined);
    const store = {
      findMany: vi.fn().mockResolvedValue([row]),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (data.status === "PROCESSING") {
          Object.assign(row, data, { attempts: (row.attempts ?? 0) + 1 });
          return { count: 1 };
        }
        if (where.processingToken !== row.processingToken) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: any) => Object.assign(row, data)),
    };
    const service = new NotificationService({ notification: store } as any, [{ channel: "EMAIL", send: sends }]);

    await service.retryFailed();

    expect(store.updateMany).toHaveBeenCalled();
    expect(sends).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("SENT");
  });

  it("claims failed, legacy queued, and stale processing rows but not fresh processing rows", async () => {
    const now = new Date("2026-11-09T10:00:00.000Z");
    const failed = {
      id: "notification-failed",
      idempotencyKey: "failed-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "FAILED",
      recipientEmail: "failed@example.com",
      recipientPhone: null,
      recipientId: null,
      attempts: 1,
    };
    const queued = {
      id: "notification-queued",
      idempotencyKey: "queued-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "QUEUED",
      recipientEmail: "queued@example.com",
      recipientPhone: null,
      recipientId: null,
      attempts: 0,
    };
    const stale = {
      id: "notification-stale",
      idempotencyKey: "stale-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "PROCESSING",
      processingToken: "expired-token",
      processingAt: new Date("2026-11-09T09:00:00.000Z"),
      recipientEmail: "stale@example.com",
      recipientPhone: null,
      recipientId: null,
      attempts: 1,
    };
    const fresh = {
      id: "notification-fresh",
      idempotencyKey: "fresh-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "PROCESSING",
      processingToken: "fresh-token",
      processingAt: new Date("2026-11-09T09:59:00.000Z"),
      recipientEmail: "fresh@example.com",
      recipientPhone: null,
      recipientId: null,
      attempts: 1,
    };
    const rows: any[] = [failed, queued, stale, fresh];
    const findMany = vi.fn().mockResolvedValue([failed, queued, stale]);
    const updateMany = vi.fn(async ({ where, data }: any) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) return { count: 0 };
      if (data.status === "PROCESSING") {
        Object.assign(row, data, { attempts: (row.attempts ?? 0) + 1 });
        return { count: 1 };
      }
      if (where.processingToken !== row.processingToken) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const sends = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationService({ notification: {
      findMany,
      updateMany,
    } } as any, [{ channel: "EMAIL", send: sends }]);

    await service.retryFailed(10, now);

    const query = findMany.mock.calls[0][0].where;
    expect(query.OR).toEqual(expect.arrayContaining([
      { status: "FAILED", OR: expect.any(Array) },
      { status: "QUEUED" },
      { status: "PROCESSING", processingAt: { lt: expect.any(Date) } },
    ]));
    expect(sends).toHaveBeenCalledTimes(3);
    expect(failed.status).toBe("SENT");
    expect(queued.status).toBe("SENT");
    expect(stale.status).toBe("SENT");
    expect(fresh.status).toBe("PROCESSING");
  });

  it("fences a stale successful worker from overwriting a replacement claim", async () => {
    const row: any = {
      id: "notification-fenced-success",
      idempotencyKey: "fenced-success-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "PROCESSING",
      processingToken: "expired-token",
      processingAt: new Date("2026-11-09T09:00:00.000Z"),
      recipientEmail: "fenced-success@example.com",
      recipientPhone: null,
      recipientId: null,
      attempts: 1,
    };
    const findMany = vi.fn().mockResolvedValue([row]);
    const updateMany = vi.fn(async ({ where, data }: any) => {
      if (data.status === "PROCESSING") {
        Object.assign(row, data, { attempts: row.attempts + 1 });
        return { count: 1 };
      }
      if (where.processingToken !== row.processingToken) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const sends = vi.fn().mockImplementation(async () => {
      row.processingToken = "replacement-token";
      row.status = "PROCESSING";
    });
    const service = new NotificationService({ notification: { findMany, updateMany } } as any, [{ channel: "EMAIL", send: sends }]);

    await service.retryFailed(10, new Date("2026-11-09T10:00:00.000Z"));

    expect(sends).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("PROCESSING");
    expect(row.processingToken).toBe("replacement-token");
    expect(updateMany.mock.calls.at(-1)?.[0].where).toMatchObject({
      id: row.id,
      processingToken: expect.any(String),
    });
  });

  it("fences a stale failed worker from overwriting a replacement claim", async () => {
    const row: any = {
      id: "notification-fenced-failure",
      idempotencyKey: "fenced-failure-key",
      event: "INQUIRY_CREATED",
      channel: "EMAIL",
      status: "PROCESSING",
      processingToken: "expired-token",
      processingAt: new Date("2026-11-09T09:00:00.000Z"),
      recipientEmail: "fenced-failure@example.com",
      recipientPhone: null,
      recipientId: null,
      attempts: 1,
    };
    const findMany = vi.fn().mockResolvedValue([row]);
    const updateMany = vi.fn(async ({ where, data }: any) => {
      if (data.status === "PROCESSING") {
        Object.assign(row, data, { attempts: row.attempts + 1 });
        return { count: 1 };
      }
      if (where.processingToken !== row.processingToken) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const sends = vi.fn().mockImplementation(async () => {
      row.processingToken = "replacement-token";
      row.status = "PROCESSING";
      throw new Error("provider unavailable");
    });
    const service = new NotificationService({ notification: { findMany, updateMany } } as any, [{ channel: "EMAIL", send: sends }]);

    await service.retryFailed(10, new Date("2026-11-09T10:00:00.000Z"));

    expect(sends).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("PROCESSING");
    expect(row.processingToken).toBe("replacement-token");
    expect(updateMany.mock.calls.at(-1)?.[0].where).toMatchObject({
      id: row.id,
      processingToken: expect.any(String),
    });
  });

  it("persists an idempotency key and delivers an event only once", async () => {
    const rows = new Map<string, any>();
    const sends = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      notification: {
        findUnique: vi.fn(async ({ where }: any) => rows.get(where.idempotencyKey) ?? null),
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `notification-${rows.size + 1}`, ...data };
          rows.set(row.idempotencyKey, row);
          return row;
        }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = [...rows.values()].find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = [...rows.values()].find((item) => item.id === where.id);
        if (!row) return { count: 0 };
        if (data.status !== "PROCESSING" && where.processingToken !== row.processingToken) return { count: 0 };
        if (data.status === "PROCESSING" && !["FAILED", "QUEUED"].includes(row.status)) return { count: 0 };
        Object.assign(row, data, { attempts: (row.attempts ?? 0) + 1 });
        return { count: 1 };
      }),
      },
    };
    const adapter: ChannelAdapter = { channel: "EMAIL", send: sends };
    const service = new NotificationService(prisma as any, [adapter]);
    const event: NotificationEvent = {
      type: "INQUIRY_CREATED",
      inquiryId: "inquiry-1",
      recipients: [{ email: "guest@example.com" }],
      channels: ["EMAIL"],
      body: "Hello",
    };

    await service.enqueue(event);
    await service.enqueue(event);
    expect(sends).toHaveBeenCalledTimes(1);
    expect(sends.mock.calls[0][0].idempotencyKey).toEqual(expect.any(String));
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ idempotencyKey: expect.any(String) }) });
  });

  it("retries a persisted failed delivery on the next enqueue", async () => {
    const rows = new Map<string, any>();
    const sends = vi.fn()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce(undefined);
    const prisma = {
      notification: {
        findUnique: vi.fn(async ({ where }: any) => rows.get(where.idempotencyKey) ?? null),
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `notification-${rows.size + 1}`, ...data };
          rows.set(row.idempotencyKey, row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = [...rows.values()].find((item) => item.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const row = [...rows.values()].find((item) => item.id === where.id);
          if (!row) return { count: 0 };
          if (data.status !== "PROCESSING" && where.processingToken !== row.processingToken) return { count: 0 };
          if (data.status === "PROCESSING" && !["FAILED", "QUEUED"].includes(row.status)) return { count: 0 };
          Object.assign(row, data, { attempts: (row.attempts ?? 0) + 1 });
          return { count: 1 };
        }),
      },
    };
    const service = new NotificationService(prisma as any, [{ channel: "EMAIL", send: sends }]);
    const event: NotificationEvent = {
      type: "INQUIRY_CREATED",
      inquiryId: "inquiry-retry",
      recipients: [{ email: "retry@example.com" }],
      channels: ["EMAIL"],
    };

    await service.enqueue(event);
    expect([...rows.values()][0].status).toBe("FAILED");
    await service.enqueue(event);

    expect(sends).toHaveBeenCalledTimes(2);
    expect([...rows.values()][0].status).toBe("SENT");
  });

  it("returns FAILED when a durable provider attempt fails", async () => {
    const rows = new Map<string, any>();
    const sends = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const prisma = {
      notification: {
        findUnique: vi.fn(async ({ where }: any) => rows.get(where.idempotencyKey) ?? null),
        create: vi.fn(async ({ data }: any) => {
          const row = { id: "notification-failure", ...data };
          rows.set(row.idempotencyKey, row);
          return row;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const row = [...rows.values()].find((candidate) => candidate.id === where.id && candidate.processingToken === where.processingToken);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
    };
    const service = new NotificationService(prisma as any, [{ channel: "EMAIL", send: sends }]);

    const [delivery] = await service.enqueue({
      type: "OWNER_EMAIL_VERIFICATION",
      recipients: [{ email: "owner@example.com" }],
      channels: ["EMAIL"],
    });

    expect(delivery.status).toBe("FAILED");
    expect([...rows.values()][0].status).toBe("FAILED");
  });
});
