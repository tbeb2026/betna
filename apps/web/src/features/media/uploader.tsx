"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type MediaPurpose = "LISTING" | "INSPECTION_EVIDENCE";

type UploadTarget = {
  mediaId: string;
  uploadUrl: string;
  headers?: Record<string, string>;
  maxBytes: number;
};

type MediaUploaderProps = {
  propertyId: string;
  purpose?: MediaPurpose;
  maxBytes?: number;
};

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Uploads directly to signed storage targets; file bytes never pass through Next.js. */
export function MediaUploader({
  propertyId,
  purpose = "LISTING",
  maxBytes = DEFAULT_MAX_BYTES,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("portal.media");
  const [selected, setSelected] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  function chooseFiles(files: FileList | null) {
    const next = Array.from(files ?? []);
    const invalid = next.find(
      (file) =>
        !file.type.startsWith("image/") ||
        file.size <= 0 ||
        file.size > maxBytes,
    );
    if (invalid) {
      setMessage(t("invalidImage", { name: invalid.name }));
      setSelected([]);
      return;
    }
    setMessage("");
    setSelected(next);
  }

  async function upload() {
    if (!selected.length || uploading) return;
    setUploading(true);
    setMessage("");
    try {
      for (const file of selected) {
        const targetResponse = await fetch(
          "/api/bff/media/upload-target",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              propertyId,
              purpose,
              contentType: file.type,
              sizeBytes: file.size,
              fileName: file.name,
            }),
          },
        );
        if (!targetResponse.ok) throw new Error(t("prepareFailed"));
        const target = (await targetResponse.json()) as UploadTarget;
        const uploadResponse = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, ...(target.headers ?? {}) },
          body: file,
        });
        if (!uploadResponse.ok)
          throw new Error(t("uploadFailed", { name: file.name }));
        const completeResponse = await fetch(
          `/api/bff/media/${encodeURIComponent(target.mediaId)}/complete`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
            },
            credentials: "include",
          },
        );
        if (!completeResponse.ok)
          throw new Error(t("scanFailed", { name: file.name }));
      }
      setSelected([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage(t("complete"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("failed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby="media-uploader-title" className="form-section">
      <h3 id="media-uploader-title">{t("title")}</h3>
      <p className="form-help">
        {t("help")}
      </p>
      <label htmlFor="property-media">{t("choose")}</label>
      <input
        ref={inputRef}
        id="property-media"
        name="property-media"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={(event) => chooseFiles(event.target.files)}
        disabled={uploading}
      />
      {selected.length ? (
        <p className="form-help">{t("ready", { count: selected.length })}</p>
      ) : null}
      <button
        className="button secondary"
        type="button"
        onClick={upload}
        disabled={!selected.length || uploading}
      >
        {uploading ? t("uploading") : t("upload")}
      </button>
      {message ? (
        <p role="status" className="form-help">
          {message}
        </p>
      ) : null}
    </section>
  );
}
