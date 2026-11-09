"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

export function UnavailableDateEditor({ initialDates = [] }: { initialDates?: Array<{ id: string; propertyId?: string; startDate: string; endDate: string; reason?: string | null }> }) {
  const [message, setMessage] = useState("");
  const t = useTranslations("portal.availability");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    const values = new FormData(form);
    try {
      const response = await fetch(`/api/bff/owner/availability/unavailable${editingId ? `/${encodeURIComponent(editingId)}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? {} : { propertyId: values.get("propertyId") }),
          startDate: values.get("startDate"),
          endDate: values.get("endDate"),
          reason: values.get("reason"),
        }),
      });
      if (!response.ok) throw new Error(t("saveFailed"));
      form.reset();
      setEditingId(null);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/bff/owner/availability/unavailable/${encodeURIComponent(id)}`, { method: "DELETE" });
    setMessage(response.ok ? t("removed") : t("removeFailed"));
  }

  function edit(date: { id: string; propertyId?: string; startDate: string; endDate: string; reason?: string | null }) {
    const form = formRef.current;
    if (!form) return;
    setEditingId(date.id);
    (form.elements.namedItem("propertyId") as HTMLInputElement).value = date.propertyId ?? "";
    (form.elements.namedItem("startDate") as HTMLInputElement).value = date.startDate.slice(0, 10);
    (form.elements.namedItem("endDate") as HTMLInputElement).value = date.endDate.slice(0, 10);
    (form.elements.namedItem("reason") as HTMLInputElement).value = date.reason ?? "";
  }

  return (
    <form ref={formRef} className="form-section" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
      <h3>{editingId ? t("edit") : t("block")}</h3>
      <label>{t("propertyId")}<input name="propertyId" required disabled={Boolean(editingId)} /></label>
      <label>{t("startDate")}<input name="startDate" type="date" required /></label>
      <label>{t("endDate")}<input name="endDate" type="date" required /></label>
      <label>{t("reason")}<input name="reason" maxLength={240} /></label>
      <button className="button secondary" type="submit" disabled={busy}>{busy ? t("saving") : editingId ? t("update") : t("save")}</button>
      {editingId ? <button className="button secondary" type="button" onClick={() => { setEditingId(null); formRef.current?.reset(); }}>{t("cancel")}</button> : null}
      <p className="form-help" role="status">{message}</p>
      {initialDates.length ? <div className="property-list">{initialDates.map((date) => <article className="property-list-item" key={date.id}><span>{date.startDate} – {date.endDate}{date.reason ? ` · ${date.reason}` : ""}</span><span className="actions"><button className="button secondary" type="button" onClick={() => edit(date)}>{t("edit")}</button><button className="button secondary" type="button" onClick={() => void remove(date.id)}>{t("remove")}</button></span></article>)}</div> : null}
    </form>
  );
}
