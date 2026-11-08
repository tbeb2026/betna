import { describe, expect, it, vi } from "vitest";
import { NotificationEvent, NotificationService } from "./notifications.service";
import { ChannelAdapter } from "./channel.adapter";

describe("NotificationService", () => {
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
});
