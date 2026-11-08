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
    const row = {
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(async ({ data }: any) => Object.assign(row, data)),
    };
    const service = new NotificationService({ notification: store } as any, [{ channel: "EMAIL", send: sends }]);

    await service.retryFailed();

    expect(store.updateMany).toHaveBeenCalled();
    expect(sends).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("SENT");
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
        const row = [...rows.values()].find((item) => item.id === where.id && ["FAILED", "QUEUED"].includes(item.status));
        if (!row) return { count: 0 };
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
          const row = [...rows.values()].find((item) => item.id === where.id && ["FAILED", "QUEUED"].includes(item.status));
          if (!row) return { count: 0 };
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
});
