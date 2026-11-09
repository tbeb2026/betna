"use client";

import { useState } from "react";

export function AdminReviewActions({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [status, setStatus] = useState("");

  async function review(decision: "APPROVED" | "REJECTED") {
    setStatus("Saving review…");
    const response = await fetch(
      `/api/bff/verification/inspections/${encodeURIComponent(inspectionId)}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
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
