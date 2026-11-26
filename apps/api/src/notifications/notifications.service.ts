import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  ChannelAdapter,
  defaultChannelAdapters,
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient,
  NOTIFICATION_CHANNEL_ADAPTERS,
} from "./channel.adapter";
import { notificationMessage, type NotificationTemplateKey } from "../i18n/messages";

export interface NotificationEvent {
  type: string;
  inquiryId?: string;
  reference?: string;
  recipients: NotificationRecipient[];
  locale?: string;
  channels?: readonly NotificationChannel[];
  subject?: string;
  body?: string;
  messageKey?: NotificationTemplateKey;
  messageValues?: Record<string, string | number | undefined>;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

type NotificationRow = {
  id: string;
  idempotencyKey: string;
  event: string;
  channel: string;
  status: string;
  attempts?: number;
  processingToken?: string | null;
  processingAt?: Date | null;
  nextAttemptAt?: Date | null;
  recipientId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientLocale?: string | null;
  inquiryId?: string | null;
  reference?: string | null;
  subject?: string | null;
  body?: string | null;
  payload?: Record<string, unknown>;
};

type NotificationStore = {
  create?: (args: { data: Record<string, unknown> }) => Promise<NotificationRow>;
  update?: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<any>;
  updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  findUnique?: (args: { where: { idempotencyKey: string } }) => Promise<NotificationRow | null>;
  findMany?: (args: { where: Record<string, unknown>; take: number }) => Promise<NotificationRow[]>;
};

const RETRY_LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

@Injectable()
export class NotificationService {
  private readonly adapters: Map<NotificationChannel, ChannelAdapter>;
  private readonly seenKeys = new Set<string>();
  private readonly inFlight = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService | { notification?: NotificationStore } = {} as PrismaService,
    @Inject(NOTIFICATION_CHANNEL_ADAPTERS) adapters: ChannelAdapter[] = defaultChannelAdapters(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  /** Queue a durable delivery. Only the process that claims the row may call the provider. */
  async enqueue(event: NotificationEvent): Promise<any[]> {
    const channels = event.channels ?? ["IN_APP", "EMAIL", "WHATSAPP", "SMS"];
    const deliveries: any[] = [];
    for (const recipient of event.recipients) {
      for (const channel of channels) {
        if (!this.hasAddress(recipient, channel)) continue;
        const idempotencyKey = this.keyFor(event, recipient, channel);
        const delivery = this.inFlight.get(idempotencyKey) ?? this.deliver(event, recipient, channel, idempotencyKey);
        this.inFlight.set(idempotencyKey, delivery);
        deliveries.push(await delivery);
      }
    }
    return deliveries;
  }

  /** Retry failed, legacy queued, and expired processing rows from any worker. */
  async retryFailed(limit = 100, now = new Date()): Promise<number> {
    const store = this.store();
    if (!store?.findMany) return 0;
    const staleBefore = new Date(now.getTime() - RETRY_LEASE_MS);
    const rows = await store.findMany({
      where: {
        OR: [
          { status: "FAILED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          { status: "QUEUED" },
          { status: "PROCESSING", processingAt: { lt: staleBefore } },
        ],
      },
      take: limit,
    });
    let retried = 0;
    for (const row of rows) {
      const claimed = await this.claimExisting(row, store, now);
      if (!claimed) continue;
      await this.sendClaimed(claimed, store);
      retried += 1;
    }
    return retried;
  }

  private deliver(event: NotificationEvent, recipient: NotificationRecipient, channel: NotificationChannel, idempotencyKey: string): Promise<any> {
    const work = (async () => {
      const store = this.store();
      if (!store?.create) {
        if (this.seenKeys.has(idempotencyKey)) return { status: "SENT", idempotencyKey };
        const adapter = this.adapters.get(channel);
        if (!adapter) throw new Error(`No adapter configured for ${channel}`);
        await adapter.send(this.message(event, recipient, channel, idempotencyKey));
        this.seenKeys.add(idempotencyKey);
        return { status: "SENT", idempotencyKey };
      }

      const existing = await store.findUnique?.({ where: { idempotencyKey } });
      let row: NotificationRow | null = existing ?? null;
      let owned = false;
      const now = new Date();
      if (!row) {
        const token = randomUUID();
        try {
          row = await store.create({ data: this.rowData(event, recipient, channel, idempotencyKey, token, now) });
          owned = true;
        } catch (error) {
          // A concurrent process may have won the unique insert. Never send
          // as the loser; claim only a failed or stale processing row.
          row = await store.findUnique?.({ where: { idempotencyKey } }) ?? null;
          if (!row) throw error;
        }
      }
      if (!owned) row = await this.claimExisting(row, store, now);
      if (!row) return existing;
      return this.sendClaimed(row, store);
    })();
    void work.then(() => this.inFlight.delete(idempotencyKey), () => this.inFlight.delete(idempotencyKey));
    return work;
  }

  private async claimExisting(row: NotificationRow, store: NotificationStore, now: Date): Promise<NotificationRow | null> {
    if (row.status === "SENT" || !store.updateMany) return null;
    const token = randomUUID();
    const staleBefore = new Date(now.getTime() - RETRY_LEASE_MS);
    const result = await store.updateMany({
      where: {
        id: row.id,
        OR: [
          { status: { in: ["FAILED", "QUEUED"] } },
          { status: "PROCESSING", processingAt: { lt: staleBefore } },
        ],
      },
      data: { status: "PROCESSING", processingToken: token, processingAt: now, attempts: { increment: 1 } },
    });
    if (result.count !== 1) return null;
    return { ...row, status: "PROCESSING", processingToken: token, processingAt: now, attempts: (row.attempts ?? 0) + 1 };
  }

  private async sendClaimed(row: NotificationRow, store: NotificationStore): Promise<NotificationRow> {
    const channel = row.channel as NotificationChannel;
    const recipient: NotificationRecipient = {
      userId: row.recipientId ?? undefined,
      email: row.recipientEmail ?? undefined,
      phone: row.recipientPhone ?? undefined,
      locale: row.recipientLocale ?? undefined,
    };
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      return this.markFailed(row, store, `No adapter configured for ${channel}`);
    }
    try {
      await adapter.send({
        event: row.event,
        channel,
        recipient,
        idempotencyKey: row.idempotencyKey,
        subject: row.subject ?? notificationMessage("en", "system.generic").subject,
        body: row.body ?? notificationMessage("en", "system.generic", { referenceSuffix: row.reference ? ` for ${row.reference}` : "" }).body,
        payload: row.payload,
      });
      return this.markSent(row, store);
    } catch (error) {
      return this.markFailed(row, store, error instanceof Error ? error.message : String(error));
    }
  }

  private async markFailed(row: NotificationRow, store: NotificationStore, error: string): Promise<NotificationRow> {
    if (!store.updateMany || !row.processingToken) return { ...row, status: "FAILED" };
    const attempts = row.attempts ?? 1;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
    const result = await store.updateMany({
      where: { id: row.id, status: "PROCESSING", processingToken: row.processingToken },
      data: { status: "FAILED", error, processingToken: null, processingAt: null, nextAttemptAt: new Date(Date.now() + delay) },
    });
    return result.count === 1
      ? { ...row, status: "FAILED", processingToken: null, processingAt: null, nextAttemptAt: new Date(Date.now() + delay) }
      : row;
  }

  private async markSent(row: NotificationRow, store: NotificationStore): Promise<NotificationRow> {
    if (!store.updateMany || !row.processingToken) return row;
    const result = await store.updateMany({
      where: { id: row.id, status: "PROCESSING", processingToken: row.processingToken },
      data: { status: "SENT", sentAt: new Date(), error: null, processingToken: null, processingAt: null, nextAttemptAt: null },
    });
    return result.count === 1 ? { ...row, status: "SENT", processingToken: null, processingAt: null, nextAttemptAt: null } : row;
  }

  private rowData(event: NotificationEvent, recipient: NotificationRecipient, channel: NotificationChannel, idempotencyKey: string, token: string, now: Date) {
    const content = this.content(event, recipient);
    return {
      id: randomUUID(), idempotencyKey, event: event.type, channel, status: "PROCESSING", attempts: 1,
      processingToken: token, processingAt: now, recipientId: recipient.userId,
      recipientEmail: recipient.email ?? undefined, recipientPhone: recipient.phone ?? undefined,
      recipientLocale: recipient.locale ?? undefined,
      inquiryId: event.inquiryId, reference: event.reference, subject: content.subject, body: content.body,
      payload: event.payload ?? {},
    };
  }

  private message(event: NotificationEvent, recipient: NotificationRecipient, channel: NotificationChannel, idempotencyKey?: string): NotificationMessage {
    const content = this.content(event, recipient);
    return { event: event.type, channel, recipient, idempotencyKey, subject: content.subject, body: content.body, payload: event.payload };
  }

  private content(event: NotificationEvent, recipient: NotificationRecipient) {
    if (event.messageKey) {
      return notificationMessage(
        recipient.locale ?? event.locale,
        event.messageKey,
        { reference: event.reference, ...(event.messageValues ?? {}) },
      );
    }
    if (event.subject || event.body) return { subject: event.subject, body: event.body ?? notificationMessage(event.locale, "system.generic", { referenceSuffix: event.reference ? ` for ${event.reference}` : "" }).body };
    return notificationMessage(event.locale, "system.generic", { referenceSuffix: event.reference ? ` for ${event.reference}` : "" });
  }

  private store() { return (this.prisma as any).notification as NotificationStore | undefined; }

  private keyFor(event: NotificationEvent, recipient: NotificationRecipient, channel: NotificationChannel) {
    if (event.idempotencyKey?.trim()) return `${event.idempotencyKey.trim()}:${channel}:${recipient.userId ?? recipient.email ?? recipient.phone ?? "unknown"}`;
    const input = [event.type, event.inquiryId ?? "", event.reference ?? "", channel, recipient.userId ?? "", recipient.email ?? "", recipient.phone ?? ""].join("|");
    return `notification:${createHash("sha256").update(input).digest("hex")}`;
  }

  private hasAddress(recipient: NotificationRecipient, channel: NotificationChannel) {
    if (channel === "IN_APP") return Boolean(recipient.userId);
    if (channel === "EMAIL") return Boolean(recipient.email);
    return Boolean(recipient.phone);
  }
}
