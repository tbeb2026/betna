"use client";

import { FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getApiBaseUrl } from "../../lib/api-client";

export function GuestInquiryForm({
  propertyId,
  offeringId,
  defaultMode = "SHORT_STAY",
}: {
  propertyId: string;
  offeringId?: string;
  defaultMode?: "SHORT_STAY" | "LONG_TERM";
}) {
  const t = useTranslations("publicInquiry");
  const locale = useLocale();
  const [status, setStatus] = useState("");
  const [reference, setReference] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(t("sending"));
    const form = new FormData(event.currentTarget);
    const payload = {
      propertyId,
      offeringId,
      mode: form.get("mode"),
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      message: form.get("message"),
      startDate: form.get("startDate") || undefined,
      endDate: form.get("endDate") || undefined,
      guests: form.get("guests") ? Number(form.get("guests")) : undefined,
      locale,
      honeypot: form.get("website") || undefined,
    };
    try {
      const response = await fetch(`${getApiBaseUrl()}/public/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? t("sendFailed"));
      setReference(body.inquiry?.reference ?? "");
      setStatus(body.reviewExpectation ?? t("sent"));
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("sendFailed"));
    }
  }

  return (
    <form className="portal-card inquiry-form" onSubmit={submit} aria-labelledby="guest-inquiry-title">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h2 id="guest-inquiry-title">{t("title")}</h2>
      <p className="form-help">{t("description")}</p>
      <div className="form-grid">
        <label>{t("name")}<input name="name" required autoComplete="name" /></label>
        <label>{t("email")}<input name="email" type="email" required autoComplete="email" /></label>
        <label>{t("phone")}<input name="phone" required autoComplete="tel" /></label>
        <label>{t("mode")}<select name="mode" defaultValue={defaultMode}><option value="SHORT_STAY">{t("shortStay")}</option><option value="LONG_TERM">{t("longTerm")}</option></select></label>
        <label>{t("startDate")}<input name="startDate" type="date" /></label>
        <label>{t("endDate")}<input name="endDate" type="date" /></label>
        <label>{t("guests")}<input name="guests" type="number" min="1" max="100" /></label>
        <label className="honeypot" aria-hidden="true">{t("website")}<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label>{t("message")}<textarea name="message" required rows={4} placeholder={t("messagePlaceholder")} /></label>
      <button className="button primary" type="submit">{t("submit")}</button>
      <p className="form-help" role="status" aria-live="polite">{reference ? `${t("reference", { reference })} ` : ""}{status}</p>
    </form>
  );
}
