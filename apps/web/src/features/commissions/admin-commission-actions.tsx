"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  conversionId: string;
  conversionStatus: string;
  commission?: { id: string; status: string } | null;
};

export function AdminCommissionActions({ conversionId, conversionStatus, commission }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useTranslations("portal.commissionActions");
  async function act(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const response = await fetch(`/api/bff${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(t("failed"));
      setMessage(t("updated"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("couldNotUpdate"));
    } finally {
      setBusy(false);
    }
  }
  const actions = [] as React.ReactNode[];
  if (conversionStatus === "EVIDENCE_PENDING") {
    actions.push(<button key="verify" className="button primary" type="button" disabled={busy} onClick={() => void act(`/admin/conversions/${encodeURIComponent(conversionId)}/verify`, { approved: true })}>{t("verifyEvidence")}</button>);
  }
  if (conversionStatus === "VERIFIED" && !commission) {
    actions.push(<button key="due" className="button primary" type="button" disabled={busy} onClick={() => void act(`/admin/conversions/${encodeURIComponent(conversionId)}/mark-due`)}>{t("markDue")}</button>);
  }
  if (commission?.status === "COMMISSION_DUE") {
    actions.push(<button key="paid" className="button primary" type="button" disabled={busy} onClick={() => void act(`/admin/commissions/${encodeURIComponent(commission.id)}/paid`)}>{t("markPaid")}</button>);
    actions.push(<button key="waive" className="button secondary" type="button" disabled={busy} onClick={() => void act(`/admin/commissions/${encodeURIComponent(commission.id)}/waive`)}>{t("waive")}</button>);
    actions.push(<button key="dispute" className="button secondary" type="button" disabled={busy} onClick={() => void act(`/admin/commissions/${encodeURIComponent(commission.id)}/dispute`)}>{t("dispute")}</button>);
  }
  if (!actions.length) return <span className="form-help">{message || (commission?.status ?? conversionStatus)}</span>;
  return <div className="actions">{actions}<span className="form-help" role="status">{message}</span></div>;
}
