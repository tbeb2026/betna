"use client";

import { useState } from "react";
import { getApiBaseUrl } from "../../lib/api-client";
import { OfflineInspectionQueue } from "./offline-queue";
import { UploadStatus } from "./upload-status";

export function InspectionForm({
  inspectionId,
  authToken,
}: {
  inspectionId: string;
  authToken?: string;
}) {
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState(
    "Offline drafts are encrypted on this device.",
  );
  const [pending, setPending] = useState(false);
  const queue = new OfflineInspectionQueue();
  const draft = () => ({
    inspectionId,
    checklist: {
      identityAuthorization: true,
      exactLocation: true,
      currentPhotos: true,
      statedPrice: true,
      category: true,
      safetyCondition: true,
      residentialUtilities: true,
    },
    evidence: [{ mediaId: `offline-${inspectionId}` }],
    notes,
    submitted: pending,
    updatedAt: new Date().toISOString(),
  });

  async function saveDraft() {
    await queue.enqueue(draft());
    setStatus("Draft saved offline");
  }

  async function submit() {
    setPending(true);
    await queue.enqueue({ ...draft(), submitted: true });
    setStatus("Pending upload — reconnect to sync evidence");
  }

  async function retry() {
    try {
      await queue.flush(async (entry) => {
        const response = await fetch(
          `${getApiBaseUrl()}/verification/inspections/${entry.inspectionId}/submit`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify(entry),
          },
        );
        if (!response.ok) throw new Error("upload failed");
      });
      setStatus("Upload synced");
      setPending(false);
    } catch {
      setStatus("Pending upload — retry when online");
    }
  }

  return (
    <form
      className="portal-card property-card"
      onSubmit={(event) => event.preventDefault()}
    >
      <p className="eyebrow">Offline capable</p>
      <h2>Inspection form</h2>
      <p className="form-help">
        Required checklist and evidence remain encrypted offline until upload
        succeeds.
      </p>
      <label htmlFor="inspection-notes">Inspection notes</label>
      <textarea
        id="inspection-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={5}
      />
      <div className="actions">
        <button className="button secondary" type="button" onClick={saveDraft}>
          Save draft
        </button>
        <button className="button primary" type="button" onClick={submit}>
          Submit inspection
        </button>
        {pending ? (
          <button className="button secondary" type="button" onClick={retry}>
            Retry upload
          </button>
        ) : null}
      </div>
      <UploadStatus status={status} />
    </form>
  );
}
