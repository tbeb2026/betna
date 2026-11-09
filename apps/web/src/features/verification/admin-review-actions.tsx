"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function AdminReviewActions({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [status, setStatus] = useState("");
  const t = useTranslations("portal.reviewActions");

  async function review(decision: "APPROVED" | "REJECTED") {
    setStatus(t("saving"));
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
    setStatus(response.ok ? (decision === "APPROVED" ? t("approved") : t("rejected")) : t("failed"));
  }

  return (
    <div className="actions">
      <button className="button primary" type="button" onClick={() => review("APPROVED")}>
        {t("approve")}
      </button>
      <button className="button secondary" type="button" onClick={() => review("REJECTED")}>
        {t("reject")}
      </button>
      <span className="form-help" role="status" aria-live="polite">{status}</span>
    </div>
  );
}
