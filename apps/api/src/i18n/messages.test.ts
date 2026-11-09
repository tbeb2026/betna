import { describe, expect, it } from "vitest";
import { notificationMessage, normalizeNotificationLocale } from "./messages";

describe("notification locale selection", () => {
  it("normalizes unknown locales to English and supports Tigrinya variants", () => {
    expect(normalizeNotificationLocale("ti-ER")).toBe("ti");
    expect(normalizeNotificationLocale("sw")).toBe("en");
    expect(normalizeNotificationLocale(undefined)).toBe("en");
  });

  it("renders inquiry notifications from the requested Tigrinya catalog", () => {
    const rendered = notificationMessage("ti", "inquiry.created", { reference: "BTNA-123" });
    expect(rendered.subject).not.toContain("New Betna inquiry");
    expect(rendered.body).not.toContain("Betna received inquiry");
    expect(rendered.subject).toContain("BTNA-123");
  });

  it("renders English when a notification recipient has no supported locale", () => {
    const rendered = notificationMessage("unknown", "availability.autoDeclined", { reference: "BTNA-123" });
    expect(rendered.subject).toContain("Betna update");
    expect(rendered.body).toContain("no longer available");
  });
});
