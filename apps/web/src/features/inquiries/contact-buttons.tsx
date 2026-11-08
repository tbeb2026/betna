"use client";

import { getApiBaseUrl } from "../../lib/api-client";

function whatsappUrl(phone: string, message: string) {
  const normalized = phone.replace(/[^0-9]/g, "");
  if (normalized.length < 7 || normalized.length > 15) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

async function logClick(propertyId: string, target: "BETNA" | "OWNER", channel: "WHATSAPP" | "EMAIL") {
  try {
    await fetch(`${getApiBaseUrl()}/public/contact-click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, target, channel }),
      keepalive: true,
    });
  } catch {
    // The external WhatsApp/email action should still proceed when analytics is offline.
  }
}

export function ContactButtons({
  propertyId,
  propertyTitle,
  betnaPhone,
  ownerPhone,
  betnaEmail = "inquiries@betna.example",
}: {
  propertyId: string;
  propertyTitle: string;
  betnaPhone: string;
  ownerPhone?: string | null;
  betnaEmail?: string;
}) {
  const message = `Hello Betna, I am asking about ${propertyTitle}.`;
  const ownerMessage = `Hello, I am asking about ${propertyTitle} on Betna.`;
  const betnaWhatsApp = whatsappUrl(betnaPhone, message);
  const ownerWhatsApp = ownerPhone ? whatsappUrl(ownerPhone, ownerMessage) : null;
  return (
    <div className="actions contact-buttons" aria-label="Contact options">
      {betnaWhatsApp ? <a className="button primary" data-testid="contact-betna-whatsapp" href={betnaWhatsApp} target="_blank" rel="noreferrer" onClick={() => void logClick(propertyId, "BETNA", "WHATSAPP")}>Contact Betna on WhatsApp</a> : null}
      {ownerWhatsApp ? <a className="button secondary" data-testid="contact-owner-whatsapp" href={ownerWhatsApp} target="_blank" rel="noreferrer" onClick={() => void logClick(propertyId, "OWNER", "WHATSAPP")}>Contact owner on WhatsApp</a> : null}
      <a className="button secondary" data-testid="contact-betna-email" href={`mailto:${betnaEmail}?subject=${encodeURIComponent(`Betna inquiry: ${propertyTitle}`)}`} onClick={() => void logClick(propertyId, "BETNA", "EMAIL")}>Email Betna</a>
    </div>
  );
}
