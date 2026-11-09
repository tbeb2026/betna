"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createApiClient } from "../../lib/api-client";

export function AdminLocationActions({ inquiryId, status }: { inquiryId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(path: string, body: Record<string, string>) {
    setBusy(true);
    try { const response = await fetch(`/api/bff/admin/inquiries/${encodeURIComponent(inquiryId)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error("Location action failed"); setMessage(path.endsWith("revoke") ? "Location release revoked." : "Exact location released."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update location release."); }
    finally { setBusy(false); }
  }
  if (status === "LOCATION_APPROVED") return <div className="actions"><span className="verification-badge">Location released</span><button className="button secondary" type="button" disabled={busy} onClick={() => void request("location-release/revoke", { reason: "Admin review" })}>Revoke release</button><span className="form-help" role="status">{message}</span></div>;
  return <div className="actions"><button className="button primary" type="button" disabled={busy} onClick={() => void request("location-release", { reason: "Admin review" })}>Release exact location</button><span className="form-help" role="status">{message}</span></div>;
}
