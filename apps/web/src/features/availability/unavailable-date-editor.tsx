"use client";

import { useRef, useState } from "react";
import { getApiBaseUrl } from "../../lib/api-client";

export function UnavailableDateEditor({ token, initialDates = [] }: { token: string; initialDates?: Array<{ id: string; propertyId?: string; startDate: string; endDate: string; reason?: string | null }> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    const values = new FormData(form);
    try {
      const response = await fetch(`${getApiBaseUrl()}/owner/availability/unavailable${editingId ? `/${encodeURIComponent(editingId)}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(editingId ? {} : { propertyId: values.get("propertyId") }),
          startDate: values.get("startDate"),
          endDate: values.get("endDate"),
          reason: values.get("reason"),
        }),
      });
      if (!response.ok) throw new Error("Unavailable dates could not be saved");
      form.reset();
      setEditingId(null);
      setMessage("Unavailable dates saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unavailable dates could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`${getApiBaseUrl()}/owner/availability/unavailable/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setMessage(response.ok ? "Unavailable dates removed." : "Unavailable dates could not be removed.");
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
      <h3>{editingId ? "Edit unavailable dates" : "Block unavailable dates"}</h3>
      <label>Property ID<input name="propertyId" required disabled={Boolean(editingId)} /></label>
      <label>Start date<input name="startDate" type="date" required /></label>
      <label>End date<input name="endDate" type="date" required /></label>
      <label>Reason (optional)<input name="reason" maxLength={240} /></label>
      <button className="button secondary" type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Update unavailable dates" : "Save unavailable dates"}</button>
      {editingId ? <button className="button secondary" type="button" onClick={() => { setEditingId(null); formRef.current?.reset(); }}>Cancel edit</button> : null}
      <p className="form-help" role="status">{message}</p>
      {initialDates.length ? <div className="property-list">{initialDates.map((date) => <article className="property-list-item" key={date.id}><span>{date.startDate} – {date.endDate}{date.reason ? ` · ${date.reason}` : ""}</span><span className="actions"><button className="button secondary" type="button" onClick={() => edit(date)}>Edit</button><button className="button secondary" type="button" onClick={() => void remove(date.id)}>Remove</button></span></article>)}</div> : null}
    </form>
  );
}
