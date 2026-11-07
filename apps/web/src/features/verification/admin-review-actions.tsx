"use client";

import { useState } from "react";
import { getApiBaseUrl } from "../../lib/api-client";

export function AdminReviewActions({
  inspectionId,
  authToken,
}: {
  inspectionId: string;
  authToken?: string;
}) {
  const [status, setStatus] = useState("");

  async function review(decision: "APPROVED" | "REJECTED") {
    setStatus("Saving review…");
    const response = await fetch(
      `${getApiBaseUrl()}/verification/inspections/${inspectionId}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ decision }),
      },
    );
    setStatus(response.ok ? `Inspection ${decision.toLowerCase()}` : "Review failed; retry");
  }

  return (
    <div className="actions">
      <button className="button primary" type="button" onClick={() => review("APPROVED")}>
        Approve
      </button>
      <button className="button secondary" type="button" onClick={() => review("REJECTED")}>
        Reject
      </button>
      <span className="form-help" role="status" aria-live="polite">{status}</span>
    </div>
  );
}
