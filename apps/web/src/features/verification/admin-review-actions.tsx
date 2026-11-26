"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type EligibleVerifier = {
  id: string;
  name: string;
  email?: string | null;
};

export function canAssignInspection(
  status: string,
  eligibleVerifiers: EligibleVerifier[],
) {
  return status === "DRAFT" && eligibleVerifiers.length > 0;
}

export function assignmentPath(inspectionId: string) {
  return `/verification/inspections/${encodeURIComponent(inspectionId)}/assign`;
}

export function AdminReviewActions({
  inspectionId,
  status = "READY_FOR_REVIEW",
  verifierId,
  eligibleVerifiers = [],
}: {
  inspectionId: string;
  status?: string;
  verifierId?: string | null;
  eligibleVerifiers?: EligibleVerifier[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [selectedVerifierId, setSelectedVerifierId] = useState(verifierId ?? "");
  const [assignedVerifierId, setAssignedVerifierId] = useState(verifierId ?? "");
  const [busy, setBusy] = useState(false);
  const t = useTranslations("portal.reviewActions");

  async function assign() {
    if (!selectedVerifierId) return;
    setBusy(true);
    setMessage(t("saving"));
    try {
      const response = await fetch(`/api/bff${assignmentPath(inspectionId)}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verifierId: selectedVerifierId }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? t("unauthorized")
            : t("failed"),
        );
      }
      setAssignedVerifierId(selectedVerifierId);
      setMessage(t("assigned"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function review(decision: "APPROVED" | "REJECTED") {
    if (status !== "READY_FOR_REVIEW") return;
    setBusy(true);
    setMessage(t("saving"));
    try {
      const response = await fetch(
        `/api/bff/verification/inspections/${encodeURIComponent(inspectionId)}/review`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? t("unauthorized")
            : t("failed"),
        );
      }
      setMessage(decision === "APPROVED" ? t("approved") : t("rejected"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  if (status === "DRAFT") {
    const assigned = eligibleVerifiers.find((verifier) => verifier.id === assignedVerifierId);
    return (
      <div className="actions">
        <label htmlFor={`verifier-${inspectionId}`}>{t("verifierLabel")}</label>
        <select
          id={`verifier-${inspectionId}`}
          value={selectedVerifierId}
          disabled={busy || eligibleVerifiers.length === 0}
          onChange={(event) => setSelectedVerifierId(event.target.value)}
        >
          <option value="">{t("selectVerifier")}</option>
          {eligibleVerifiers.map((verifier) => (
            <option key={verifier.id} value={verifier.id}>
              {verifier.name}
            </option>
          ))}
        </select>
        <button
          className="button primary"
          type="button"
          disabled={busy || !canAssignInspection(status, eligibleVerifiers) || !selectedVerifierId}
          onClick={() => void assign()}
        >
          {busy ? t("saving") : assigned ? t("reassign") : t("assign")}
        </button>
        {eligibleVerifiers.length === 0 ? (
          <span className="form-help">{t("noEligibleVerifiers")}</span>
        ) : null}
        {assigned ? <span className="form-help">{t("assignedTo", { name: assigned.name })}</span> : null}
        <span className="form-help" role="status" aria-live="polite">{message}</span>
      </div>
    );
  }

  if (status !== "READY_FOR_REVIEW") return null;

  return (
    <div className="actions">
      <button className="button primary" type="button" disabled={busy} onClick={() => void review("APPROVED")}>
        {t("approve")}
      </button>
      <button className="button secondary" type="button" disabled={busy} onClick={() => void review("REJECTED")}>
        {t("reject")}
      </button>
      <span className="form-help" role="status" aria-live="polite">{message}</span>
    </div>
  );
}
