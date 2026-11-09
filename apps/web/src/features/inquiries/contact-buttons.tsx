"use client";

import { getApiBaseUrl } from "../../lib/api-client";
import { useTranslations } from "next-intl";

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
  betnaEmail = "inquiries@betna.example",
}: {
  propertyId: string;
  propertyTitle: string;
  betnaPhone: string;
  betnaEmail?: string;
}) {
  const t = useTranslations("publicProperty");
  const message = `Hello Betna, I am asking about ${propertyTitle}.`;
  const betnaWhatsApp = whatsappUrl(betnaPhone, message);
  const ownerContactUrl = `${getApiBaseUrl()}/public/properties/${encodeURIComponent(propertyId)}/contact-owner`;
  return (
    <div className="actions contact-buttons" aria-label={t("contactOptions")}>
      {betnaWhatsApp ? <a className="button primary" data-testid="contact-betna-whatsapp" href={betnaWhatsApp} target="_blank" rel="noreferrer" onClick={() => void logClick(propertyId, "BETNA", "WHATSAPP")}>{t("contactBetnaWhatsApp")}</a> : null}
      <a className="button secondary" data-testid="contact-owner-whatsapp" href={ownerContactUrl} target="_blank" rel="noreferrer">{t("contactOwnerWhatsApp")}</a>
      <a className="button secondary" data-testid="contact-betna-email" href={`mailto:${betnaEmail}?subject=${encodeURIComponent(`Betna inquiry: ${propertyTitle}`)}`} onClick={() => void logClick(propertyId, "BETNA", "EMAIL")}>{t("emailBetna")}</a>
    </div>
  );
}
