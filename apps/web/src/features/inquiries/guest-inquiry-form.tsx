"use client";

import { FormEvent, useState } from "react";
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
  const [status, setStatus] = useState("");
  const [reference, setReference] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Sending inquiry…");
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
      honeypot: form.get("website") || undefined,
    };
    try {
      const response = await fetch(`${getApiBaseUrl()}/public/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "Inquiry could not be sent");
      setReference(body.inquiry?.reference ?? "");
      setStatus(body.reviewExpectation ?? "Inquiry sent. Betna will follow up during business hours.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Inquiry could not be sent; please try again.");
    }
  }

  return (
    <form className="portal-card inquiry-form" onSubmit={submit} aria-labelledby="guest-inquiry-title">
      <p className="eyebrow">Managed inquiry</p>
      <h2 id="guest-inquiry-title">Ask about this place</h2>
      <p className="form-help">No account is required. Betna reviews inquiries during configured business hours.</p>
      <div className="form-grid">
        <label>Name<input name="name" required autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Phone or WhatsApp<input name="phone" required autoComplete="tel" /></label>
        <label>Rental mode<select name="mode" defaultValue={defaultMode}><option value="SHORT_STAY">Short stay</option><option value="LONG_TERM">Long term</option></select></label>
        <label>Start date<input name="startDate" type="date" /></label>
        <label>End date<input name="endDate" type="date" /></label>
        <label>Guests<input name="guests" type="number" min="1" max="100" /></label>
        <label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label>Message<textarea name="message" required rows={4} placeholder="What would you like to know?" /></label>
      <button className="button primary" type="submit">Send inquiry</button>
      <p className="form-help" role="status" aria-live="polite">{reference ? `Reference ${reference}. ` : ""}{status}</p>
    </form>
  );
}
