"use client";

import { useState } from "react";
import { OfflineInspectionQueue } from "./offline-queue";
import { UploadStatus } from "./upload-status";

export function InspectionForm({
  inspectionId,
  propertyId,
  category = "residential",
}: {
  inspectionId: string;
  propertyId?: string;
  category?: string;
}) {
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<
    Array<{
      file: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      mediaId?: string;
    }>
  >([]);
  const [status, setStatus] = useState(
    "Offline drafts are encrypted on this device.",
  );
  const [pending, setPending] = useState(false);
  const checklistItems = [
    "identityAuthorization",
    "exactLocation",
    "currentPhotos",
    "statedPrice",
    "category",
    "safetyCondition",
    ...(category === "land" ? ["landBoundaries", "landAccess"] : []),
    ...(category === "commercial" ? ["commercialUse", "commercialSafety"] : []),
    ...(category === "residential" ? ["residentialUtilities"] : []),
  ];
  const [checklist, setChecklist] = useState<Record<string, unknown>>(
    Object.fromEntries(checklistItems.map((item) => [item, { status: "" }])),
  );
  const queue = new OfflineInspectionQueue();
  const requestKey = `inspection:${inspectionId}`;
  const draft = (submitted = false) => ({
    inspectionId,
    checklist,
    evidence,
    notes,
    requestKey,
    submitted,
    updatedAt: new Date().toISOString(),
  });

  async function readFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read evidence"));
      reader.readAsDataURL(file);
    });
  }

  async function chooseEvidence(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    try {
      setEvidence(
        await Promise.all(
          files.map(async (file) => ({
            file: await readFile(file),
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          })),
        ),
      );
      setStatus(`${files.length} evidence item${files.length === 1 ? "" : "s"} ready offline`);
    } catch {
      setStatus("Unable to read inspection evidence");
    }
  }

  async function saveDraft() {
    try {
      await queue.enqueue(draft(false));
      setStatus("Draft saved offline");
    } catch {
      setStatus("Unable to encrypt this draft on the device");
    }
  }

  async function submit() {
    if (!evidence.length) {
      setStatus("Add at least one inspection evidence image");
      return;
    }
    setPending(true);
    await queue.enqueue(draft(true));
    setStatus("Pending upload — reconnect to sync evidence");
  }

  function dataUrlToBlob(value: string) {
    const [header, encoded] = value.split(",", 2);
    const contentType = header.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: contentType });
  }

  async function apiJson<T>(path: string, init: RequestInit) {
    const response = await fetch(`/api/bff${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`Upload request failed (${response.status})`);
    return (await response.json()) as T;
  }

  async function retry() {
    try {
      await queue.flush(async (entry, update) => {
        const syncedEvidence = [...entry.evidence];
        for (let index = 0; index < syncedEvidence.length; index += 1) {
          const item = syncedEvidence[index];
          if (!item.mediaId) {
            if (!item.file || !propertyId) {
              throw new Error("Evidence is missing its property or file");
            }
            const target = await apiJson<{
              mediaId: string;
              uploadUrl: string;
              headers?: Record<string, string>;
            }>("/media/upload-target", {
              method: "POST",
              body: JSON.stringify({
                purpose: "INSPECTION_EVIDENCE",
                propertyId,
                inspectionId: entry.inspectionId,
                contentType: item.contentType,
                sizeBytes: item.sizeBytes,
                fileName: item.fileName,
              }),
            });
            const upload = await fetch(target.uploadUrl, {
              method: "PUT",
              headers: target.headers,
              body: dataUrlToBlob(item.file),
            });
            if (!upload.ok) throw new Error("Evidence upload failed");
            await apiJson(`/media/${target.mediaId}/complete`, {
              method: "POST",
              body: "{}",
            });
            syncedEvidence[index] = { ...item, mediaId: target.mediaId };
            await update({ ...entry, evidence: syncedEvidence });
          }
        }
        const submission = await apiJson<{ status: string }>(
          `/verification/inspections/${entry.inspectionId}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              checklist: entry.checklist,
              evidence: syncedEvidence.map(({ mediaId }) => ({ mediaId })),
              notes: entry.notes,
              requestKey: entry.requestKey,
            }),
          },
        );
        if (!submission.status) throw new Error("Inspection submission failed");
        for (const item of syncedEvidence) {
          if (!item.mediaId) throw new Error("Evidence media ID is missing");
          await apiJson(
            `/verification/inspections/${entry.inspectionId}/evidence/${item.mediaId}/sync`,
            {
              method: "POST",
              body: JSON.stringify({ ok: true, validated: true }),
            },
          );
        }
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
      <label htmlFor="inspection-evidence">Inspection evidence</label>
      <input
        id="inspection-evidence"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={chooseEvidence}
      />
      <fieldset className="form-section" aria-labelledby="inspection-checklist-title">
        <legend id="inspection-checklist-title">Inspection checklist</legend>
        <p className="form-help">Record the observed result for every required item. A report cannot be approved from unfilled defaults.</p>
        {checklistItems.map((item) => (
          <label key={item} htmlFor={`check-${item}`}>
            {item.replaceAll(/([A-Z])/g, " $1")}
            <select
              id={`check-${item}`}
              value={String((checklist[item] as { status?: string })?.status ?? "")}
              onChange={(event) => setChecklist((current) => ({ ...current, [item]: { status: event.target.value } }))}
              required
            >
              <option value="">Choose result</option>
              <option value="PASS">Pass</option>
              <option value="FAIL">Fail</option>
              <option value="ESCALATE">Escalate for documents</option>
            </select>
          </label>
        ))}
      </fieldset>
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
