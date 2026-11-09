"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function OwnerInquiryActions({ inquiryId, status }: { inquiryId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const t = useTranslations("portal.ownerInquiries");
  const [busy, setBusy] = useState(false);
  const decided = ["OWNER_CONFIRMED", "OWNER_DECLINED", "CLOSED"].includes(status);
  async function respond(decision: "CONFIRMED" | "DECLINED") {
    setBusy(true);
    try { const response = await fetch(`/api/bff/owner/inquiries/${encodeURIComponent(inquiryId)}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }); if (!response.ok) throw new Error(t("actionFailed")); setMessage(decision === "CONFIRMED" ? t("confirmed") : t("declined")); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("couldNotUpdate")); }
    finally { setBusy(false); }
  }
  if (decided) return <span className="form-help">{message || t("decisionRecorded")}</span>;
  return <div className="actions"><button className="button primary" type="button" disabled={busy} onClick={() => void respond("CONFIRMED")}>{t("confirm")}</button><button className="button secondary" type="button" disabled={busy} onClick={() => void respond("DECLINED")}>{t("decline")}</button><span className="form-help" role="status">{message}</span></div>;
}
