"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("portal.inspection");
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
  const [status, setStatus] = useState(t("offlineDrafts"));
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
      reader.onerror = () => reject(reader.error ?? new Error(t("readEvidenceFailed")));
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
      setStatus(t("evidenceReady", { count: files.length }));
    } catch {
      setStatus(t("readEvidenceFailed"));
    }
  }

  async function saveDraft() {
    try {
      await queue.enqueue(draft(false));
      setStatus(t("draftSaved"));
    } catch {
      setStatus(t("draftSaveFailed"));
    }
  }

  async function submit() {
    if (!evidence.length) {
      setStatus(t("evidenceRequired"));
      return;
    }
    setPending(true);
    await queue.enqueue(draft(true));
    setStatus(t("pendingUpload"));
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
              throw new Error(t("evidenceMissing"));
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
            if (!upload.ok) throw new Error(t("evidenceUploadFailed"));
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
        if (!submission.status) throw new Error(t("submissionFailed"));
        for (const item of syncedEvidence) {
          if (!item.mediaId) throw new Error(t("evidenceMediaMissing"));
          await apiJson(
            `/verification/inspections/${entry.inspectionId}/evidence/${item.mediaId}/sync`,
            {
              method: "POST",
              body: JSON.stringify({ ok: true, validated: true }),
            },
          );
        }
      });
      setStatus(t("uploadSynced"));
      setPending(false);
    } catch {
      setStatus(t("uploadPending"));
    }
  }

  return (
    <form
      className="portal-card property-card"
      onSubmit={(event) => event.preventDefault()}
    >
      <p className="eyebrow">{t("eyebrow")}</p>
      <h2>{t("title")}</h2>
      <p className="form-help">
        {t("help")}
      </p>
      <label htmlFor="inspection-notes">{t("notes")}</label>
      <textarea
        id="inspection-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={5}
      />
      <label htmlFor="inspection-evidence">{t("evidence")}</label>
      <input
        id="inspection-evidence"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={chooseEvidence}
      />
      <fieldset className="form-section" aria-labelledby="inspection-checklist-title">
        <legend id="inspection-checklist-title">{t("checklist")}</legend>
        <p className="form-help">{t("checklistHelp")}</p>
        {checklistItems.map((item) => (
          <label key={item} htmlFor={`check-${item}`}>
            {t(`items.${item}`)}
            <select
              id={`check-${item}`}
              value={String((checklist[item] as { status?: string })?.status ?? "")}
              onChange={(event) => setChecklist((current) => ({ ...current, [item]: { status: event.target.value } }))}
              required
            >
              <option value="">{t("chooseResult")}</option>
              <option value="PASS">{t("pass")}</option>
              <option value="FAIL">{t("fail")}</option>
              <option value="ESCALATE">{t("escalate")}</option>
            </select>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button className="button secondary" type="button" onClick={saveDraft}>
          {t("saveDraft")}
        </button>
        <button className="button primary" type="button" onClick={submit}>
          {t("submit")}
        </button>
        {pending ? (
          <button className="button secondary" type="button" onClick={retry}>
            {t("retry")}
          </button>
        ) : null}
      </div>
      <UploadStatus status={status} />
    </form>
  );
}
