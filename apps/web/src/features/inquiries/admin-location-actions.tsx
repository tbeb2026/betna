"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function AdminLocationActions({ inquiryId, status }: { inquiryId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const t = useTranslations("portal.adminInquiries");
  const [busy, setBusy] = useState(false);
  async function request(path: string, body: Record<string, string>) {
    setBusy(true);
    try { const response = await fetch(`/api/bff/admin/inquiries/${encodeURIComponent(inquiryId)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(t("actionFailed")); setMessage(path.endsWith("revoke") ? t("revoked") : t("releasedMessage")); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("couldNotUpdate")); }
    finally { setBusy(false); }
  }
  if (status === "LOCATION_APPROVED") return <div className="actions"><span className="verification-badge">{t("released")}</span><button className="button secondary" type="button" disabled={busy} onClick={() => void request("location-release/revoke", { reason: t("releaseReason") })}>{t("revoke")}</button><span className="form-help" role="status">{message}</span></div>;
  return <div className="actions"><button className="button primary" type="button" disabled={busy} onClick={() => void request("location-release", { reason: t("releaseReason") })}>{t("release")}</button><span className="form-help" role="status">{message}</span></div>;
}
