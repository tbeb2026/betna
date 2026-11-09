export type NotificationChannel = "IN_APP" | "EMAIL" | "WHATSAPP" | "SMS";

export interface NotificationRecipient {
  userId?: string;
  email?: string | null;
  phone?: string | null;
}

export interface NotificationMessage {
  event: string;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  /** Stable delivery key forwarded to providers that support idempotency. */
  idempotencyKey?: string;
  subject?: string;
  body: string;
  payload?: Record<string, unknown>;
}

/** Explicit token keeps interface-typed adapter arrays resolvable by Nest. */
export const NOTIFICATION_CHANNEL_ADAPTERS = Symbol("NOTIFICATION_CHANNEL_ADAPTERS");

export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<void>;
}

/** Safe default for development; production adapters can be injected per channel. */
export class NoopChannelAdapter implements ChannelAdapter {
  constructor(public readonly channel: NotificationChannel) {}

  async send(_message: NotificationMessage): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `No ${this.channel} notification adapter is configured; refusing a silent production no-op`,
      );
    }
    return undefined;
  }
}

export function defaultChannelAdapters(): ChannelAdapter[] {
  return (["IN_APP", "EMAIL", "WHATSAPP", "SMS"] as NotificationChannel[]).map(
    (channel) => new NoopChannelAdapter(channel),
  );
}
