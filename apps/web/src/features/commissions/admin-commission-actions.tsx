"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createApiClient } from "../../lib/api-client";

type Props = {
  conversionId: string;
  conversionStatus: string;
  commission?: { id: string; status: string } | null;
  token: string;
};

export function AdminCommissionActions({ conversionId, conversionStatus, commission, token }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await createApiClient({ token }).post(path, body);
      setMessage("Updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update commission.");
    } finally {
      setBusy(false);
    }
  }
  const actions = [] as React.ReactNode[];
  if (conversionStatus === "EVIDENCE_PENDING") {
    actions.push(<button key="verify" className="button primary" type="button" disabled={busy} onClick={() => void act(`/admin/conversions/${encodeURIComponent(conversionId)}/verify`, { approved: true })}>Verify evidence</button>);
  }
  if (conversionStatus === "VERIFIED" && !commission) {
    actions.push(<button key="due" className="button primary" type="button" disabled={busy} onClick={() => void act(`/admin/conversions/${encodeURIComponent(conversionId)}/mark-due`)}>Mark commission due</button>);
  }
  if (commission?.status === "COMMISSION_DUE") {
    actions.push(<button key="paid" className="button primary" type="button" disabled={busy} onClick={() => void act(`/admin/commissions/${encodeURIComponent(commission.id)}/paid`)}>Mark paid</button>);
    actions.push(<button key="waive" className="button secondary" type="button" disabled={busy} onClick={() => void act(`/admin/commissions/${encodeURIComponent(commission.id)}/waive`)}>Waive</button>);
    actions.push(<button key="dispute" className="button secondary" type="button" disabled={busy} onClick={() => void act(`/admin/commissions/${encodeURIComponent(commission.id)}/dispute`)}>Dispute</button>);
  }
  if (!actions.length) return <span className="form-help">{message || (commission?.status ?? conversionStatus)}</span>;
  return <div className="actions">{actions}<span className="form-help" role="status">{message}</span></div>;
}
