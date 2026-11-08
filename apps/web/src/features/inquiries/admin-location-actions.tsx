"use client";

import { useState } from "react";
import { createApiClient } from "../../lib/api-client";

export function AdminLocationActions({ inquiryId, status, token }: { inquiryId: string; status: string; token: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(path: string, body: Record<string, string>) {
    setBusy(true);
    try { await createApiClient({ token }).post(`/admin/inquiries/${encodeURIComponent(inquiryId)}/${path}`, body); setMessage(path.endsWith("revoke") ? "Location release revoked." : "Exact location released."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update location release."); }
    finally { setBusy(false); }
  }
  if (status === "LOCATION_APPROVED") return <div className="actions"><span className="verification-badge">Location released</span><button className="button secondary" type="button" disabled={busy} onClick={() => void request("location-release/revoke", { reason: "Admin review" })}>Revoke release</button><span className="form-help" role="status">{message}</span></div>;
  return <div className="actions"><button className="button primary" type="button" disabled={busy} onClick={() => void request("location-release", { reason: "Admin review" })}>Release exact location</button><span className="form-help" role="status">{message}</span></div>;
}
