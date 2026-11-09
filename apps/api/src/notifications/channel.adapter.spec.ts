import { describe, expect, it, vi } from "vitest";
import { configuredChannelAdapters, MetaWhatsAppAdapter, ResendEmailAdapter } from "./channel.adapter";

describe("configured notification providers", () => {
  it("selects real adapters from provider configuration", () => {
    const configured = configuredChannelAdapters({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Betna <noreply@example.com>",
      WHATSAPP_PROVIDER: "meta",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
      WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    expect(configured.channels.find((adapter) => adapter.channel === "EMAIL")).toBeInstanceOf(ResendEmailAdapter);
    expect(configured.channels.find((adapter) => adapter.channel === "WHATSAPP")).toBeInstanceOf(MetaWhatsAppAdapter);
  });

  it("rejects production no-op provider selection", () => {
    expect(() => configuredChannelAdapters({ NODE_ENV: "production", EMAIL_PROVIDER: "log", WHATSAPP_PROVIDER: "log" })).toThrow(/EMAIL_PROVIDER/);
  });

  it("sends provider payloads over HTTPS and fails non-2xx responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const email = new ResendEmailAdapter("key", "Betna <from@example.com>", fetcher);
    await email.send({ channel: "EMAIL", event: "TEST", recipient: { email: "to@example.com" }, body: "hello" });
    expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    const whatsapp = new MetaWhatsAppAdapter("token", "phone-id", "v21.0", fetcher);
    await whatsapp.sendOtp("+254700000001", "123456", new Date("2026-01-01T00:00:00Z"));
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("graph.facebook.com/v21.0/phone-id/messages"), expect.objectContaining({ method: "POST" }));
  });
});
