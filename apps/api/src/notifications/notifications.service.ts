import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  ChannelAdapter,
  defaultChannelAdapters,
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient,
} from "./channel.adapter";

export interface NotificationEvent {
  type: string;
  inquiryId?: string;
  reference?: string;
  recipients: NotificationRecipient[];
  channels?: NotificationChannel[];
  subject?: string;
  body?: string;
  payload?: Record<string, unknown>;
}

type NotificationStore = {
  id?: string;
  create?: (args: { data: Record<string, unknown> }) => Promise<any>;
  update?: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<any>;
};

@Injectable()
export class NotificationService {
  private readonly adapters: Map<NotificationChannel, ChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService | { notification?: NotificationStore } = {} as PrismaService,
    adapters: ChannelAdapter[] = defaultChannelAdapters(),
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
        const store = (this.prisma as any).notification as NotificationStore | undefined;
        const queued = store?.create
          ? await store.create({
              data: {
                id,
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
          : { id, event: event.type, channel, status: "QUEUED", recipient };
        deliveries.push(queued);
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

  private hasAddress(recipient: NotificationRecipient, channel: NotificationChannel) {
    if (channel === "IN_APP") return Boolean(recipient.userId);
    if (channel === "EMAIL") return Boolean(recipient.email);
    return Boolean(recipient.phone);
  }
}
