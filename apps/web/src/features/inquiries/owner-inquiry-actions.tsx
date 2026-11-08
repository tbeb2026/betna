"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createApiClient } from "../../lib/api-client";

export function OwnerInquiryActions({ inquiryId, status, token }: { inquiryId: string; status: string; token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const decided = ["OWNER_CONFIRMED", "OWNER_DECLINED", "CLOSED"].includes(status);
  async function respond(decision: "CONFIRMED" | "DECLINED") {
    setBusy(true);
    try { await createApiClient({ token }).post(`/owner/inquiries/${encodeURIComponent(inquiryId)}/respond`, { decision }); setMessage(decision === "CONFIRMED" ? "Inquiry confirmed." : "Inquiry declined."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update inquiry."); }
    finally { setBusy(false); }
  }
  if (decided) return <span className="form-help">{message || "Decision recorded"}</span>;
  return <div className="actions"><button className="button primary" type="button" disabled={busy} onClick={() => void respond("CONFIRMED")}>Confirm</button><button className="button secondary" type="button" disabled={busy} onClick={() => void respond("DECLINED")}>Decline</button><span className="form-help" role="status">{message}</span></div>;
}
