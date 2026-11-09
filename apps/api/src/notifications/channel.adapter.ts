export type NotificationChannel = "IN_APP" | "EMAIL" | "WHATSAPP" | "SMS";

export interface NotificationRecipient {
  userId?: string;
  email?: string | null;
  phone?: string | null;
  /** Recipient preference; unknown values intentionally fall back to English. */
  locale?: string | null;
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

export interface WhatsAppOtpSender {
  sendOtp(phone: string, code: string, expiresAt: Date): Promise<void>;
}

export type ProviderEnvironment = Record<string, string | undefined>;

/** Real email delivery through Resend's HTTPS API. */
export class ResendEmailAdapter implements ChannelAdapter {
  readonly channel = "EMAIL" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    if (!message.recipient.email) throw new Error("Email recipient is required");
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.recipient.email],
        subject: message.subject ?? "Betna notification",
        text: message.body,
      }),
    });
    if (!response.ok) throw new Error(`Email provider rejected delivery (${response.status})`);
  }
}

/** Real WhatsApp Cloud API delivery, also used for owner OTPs. */
export class MetaWhatsAppAdapter implements ChannelAdapter, WhatsAppOtpSender {
  readonly channel = "WHATSAPP" as const;

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly apiVersion = "v21.0",
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    if (!message.recipient.phone) throw new Error("WhatsApp recipient is required");
    await this.sendText(message.recipient.phone, message.body, message.idempotencyKey);
  }

  async sendOtp(phone: string, code: string, expiresAt: Date): Promise<void> {
    await this.sendText(
      phone,
      `Your Betna WhatsApp verification code is ${code}. It expires at ${expiresAt.toISOString()}.`,
      `otp:${phone}:${expiresAt.getTime()}`,
    );
  }

  private async sendText(to: string, body: string, idempotencyKey?: string): Promise<void> {
    const response = await this.fetcher(
      `https://graph.facebook.com/${this.apiVersion}/${encodeURIComponent(this.phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body },
        }),
      },
    );
    if (!response.ok) throw new Error(`WhatsApp provider rejected delivery (${response.status})`);
  }
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

export const WHATSAPP_OTP_PROVIDER = Symbol("WHATSAPP_OTP_PROVIDER");

/** Select providers once at boot. `log` remains intentionally development/test-only. */
export function configuredChannelAdapters(
  environment: ProviderEnvironment = process.env,
): { channels: ChannelAdapter[]; whatsappOtp: WhatsAppOtpSender } {
  const nodeEnv = environment.NODE_ENV ?? "development";
  const emailProvider = (environment.EMAIL_PROVIDER ?? "log").toLowerCase();
  const whatsappProvider = (environment.WHATSAPP_PROVIDER ?? "log").toLowerCase();
  if (nodeEnv === "production" && emailProvider === "log") {
    throw new Error("EMAIL_PROVIDER must be a real provider in production");
  }
  if (nodeEnv === "production" && whatsappProvider === "log") {
    throw new Error("WHATSAPP_PROVIDER must be a real provider in production");
  }
  const channels = defaultChannelAdapters();
  let whatsappOtp: WhatsAppOtpSender = {
    async sendOtp() {
      if (nodeEnv === "production") throw new Error("WhatsApp OTP provider is not configured");
    },
  };
  if (emailProvider === "resend") {
    const apiKey = environment.RESEND_API_KEY?.trim();
    const from = environment.EMAIL_FROM?.trim();
    if (!apiKey || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM are required for Resend");
    channels[channels.findIndex((adapter) => adapter.channel === "EMAIL")] = new ResendEmailAdapter(apiKey, from);
  } else if (emailProvider !== "log") {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${emailProvider}`);
  }
  if (whatsappProvider === "meta") {
    const accessToken = environment.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!accessToken || !phoneNumberId) {
      throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required for Meta WhatsApp");
    }
    const adapter = new MetaWhatsAppAdapter(accessToken, phoneNumberId, environment.WHATSAPP_API_VERSION?.trim() || "v21.0");
    channels[channels.findIndex((candidate) => candidate.channel === "WHATSAPP")] = adapter;
    whatsappOtp = adapter;
  } else if (whatsappProvider !== "log") {
    throw new Error(`Unsupported WHATSAPP_PROVIDER: ${whatsappProvider}`);
  }
  return { channels, whatsappOtp };
}
