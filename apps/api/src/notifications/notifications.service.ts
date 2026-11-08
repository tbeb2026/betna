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

export interface NotificationEvent {
  type: string;
  inquiryId?: string;
  reference?: string;
  recipients: NotificationRecipient[];
  channels?: readonly NotificationChannel[];
  subject?: string;
  body?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

type NotificationStore = {
  id?: string;
  create?: (args: { data: Record<string, unknown> }) => Promise<any>;
  update?: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<any>;
  findUnique?: (args: { where: { idempotencyKey: string } }) => Promise<any>;
};

@Injectable()
export class NotificationService {
  private readonly adapters: Map<NotificationChannel, ChannelAdapter>;
  private readonly seenKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService | { notification?: NotificationStore } = {} as PrismaService,
    @Inject(NOTIFICATION_CHANNEL_ADAPTERS) adapters: ChannelAdapter[] = defaultChannelAdapters(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  /** Queue and deliver critical events through in-app, email and WhatsApp/SMS channels. */
  async enqueue(event: NotificationEvent): Promise<any[]> {
    const channels = event.channels ?? ["IN_APP", "EMAIL", "WHATSAPP", "SMS"];
    const deliveries: any[] = [];
    for (const recipient of event.recipients) {
      for (const channel of channels) {
        if (!this.hasAddress(recipient, channel)) continue;
        const idempotencyKey = this.keyFor(event, recipient, channel);
        if (this.seenKeys.has(idempotencyKey)) continue;
        const store = (this.prisma as any).notification as NotificationStore | undefined;
        const existing = store?.findUnique
          ? await store.findUnique({ where: { idempotencyKey } })
          : undefined;
        if (existing) {
          deliveries.push(existing);
          continue;
        }
        const message: NotificationMessage = {
          event: event.type,
          channel,
          recipient,
          subject: event.subject,
          body:
            event.body ??
            `Betna update${event.reference ? ` for ${event.reference}` : ""}.`,
          payload: event.payload,
        };
        const id = randomUUID();
        let queued;
        try {
          queued = store?.create
            ? await store.create({
              data: {
                id,
                idempotencyKey,
                event: event.type,
                channel,
                status: "QUEUED",
                recipientId: recipient.userId,
                recipientEmail: recipient.email ?? undefined,
                recipientPhone: recipient.phone ?? undefined,
                inquiryId: event.inquiryId,
                payload: event.payload ?? {},
              },
            })
            : { id, idempotencyKey, event: event.type, channel, status: "QUEUED", recipient };
        } catch (error) {
          // A concurrent worker may have won the unique insert. Re-read and
          // return that delivery rather than sending the message twice.
          if (store?.findUnique) {
            const duplicate = await store.findUnique({ where: { idempotencyKey } });
            if (duplicate) {
              deliveries.push(duplicate);
              continue;
            }
          }
          throw error;
        }
        deliveries.push(queued);
        this.seenKeys.add(idempotencyKey);
        try {
          const adapter = this.adapters.get(channel);
          if (!adapter) throw new Error(`No adapter configured for ${channel}`);
          await adapter.send(message);
          if (store?.update)
            await store.update({
              where: { id },
              data: { status: "SENT", sentAt: new Date(), error: null },
            });
        } catch (error) {
          if (store?.update)
            await store.update({
              where: { id },
              data: {
                status: "FAILED",
                error: error instanceof Error ? error.message : String(error),
              },
            });
        }
      }
    }
    return deliveries;
  }

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
