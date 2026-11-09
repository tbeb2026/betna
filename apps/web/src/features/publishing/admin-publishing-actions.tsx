"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function canPublishListing(status: string) {
  return status === "VERIFIED";
}

export function publishingPath(propertyId: string) {
  return `/admin/publishing/${encodeURIComponent(propertyId)}/publish`;
}

export function AdminPublishingActions({
  propertyId,
  status,
}: {
  propertyId: string;
  status: string;
}) {
  const router = useRouter();
  const t = useTranslations("portal.adminPublishingActions");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!canPublishListing(status)) return null;

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/bff${publishingPath(propertyId)}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? t("unauthorized")
            : t("failed"),
        );
      }
      setMessage(t("published"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions">
      <button
        className="button primary"
        type="button"
        disabled={busy}
        onClick={() => void publish()}
      >
        {busy ? t("publishing") : t("publish")}
      </button>
      <span className="form-help" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
