"use client";

import { useRef, useState } from "react";

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
  apiBaseUrl?: string;
  maxBytes?: number;
};

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Uploads directly to signed storage targets; file bytes never pass through Next.js. */
export function MediaUploader({
  propertyId,
  purpose = "LISTING",
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  maxBytes = DEFAULT_MAX_BYTES,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
      setMessage(`${invalid.name} is not a supported image or is too large.`);
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
          `${apiBaseUrl.replace(/\/$/, "")}/media/upload-target`,
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
        if (!targetResponse.ok) throw new Error("Could not prepare the upload");
        const target = (await targetResponse.json()) as UploadTarget;
        const uploadResponse = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, ...(target.headers ?? {}) },
          body: file,
        });
        if (!uploadResponse.ok)
          throw new Error(`Could not upload ${file.name}`);
        const completeResponse = await fetch(
          `${apiBaseUrl.replace(/\/$/, "")}/media/${target.mediaId}/complete`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
            credentials: "include",
          },
        );
        if (!completeResponse.ok)
          throw new Error(`Could not scan ${file.name}`);
      }
      setSelected([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Upload complete. Files are being checked for safety.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby="media-uploader-title" className="form-section">
      <h3 id="media-uploader-title">Property photos</h3>
      <p className="form-help">
        Add clear images. Betna scans every upload before a listing photo is
        published.
      </p>
      <label htmlFor="property-media">Choose images</label>
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
        <p className="form-help">{selected.length} image(s) ready.</p>
      ) : null}
      <button
        className="button secondary"
        type="button"
        onClick={upload}
        disabled={!selected.length || uploading}
      >
        {uploading ? "Uploading…" : "Upload photos"}
      </button>
      {message ? (
        <p role="status" className="form-help">
          {message}
        </p>
      ) : null}
    </section>
  );
}
