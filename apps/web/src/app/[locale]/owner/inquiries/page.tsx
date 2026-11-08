import { createApiClient } from "../../../../lib/api-client";
import { getSession } from "../../../../lib/auth";

export default async function OwnerInquiriesPage() {
  const session = await getSession();
  const inquiries = session ? await createApiClient({ token: session.token }).get<any[]>("/owner/inquiries").catch(() => []) : [];
  return (
    <div className="portal-card">
      <p className="eyebrow">Owner inquiries</p>
      <h2>Guest messages</h2>
      <p className="form-help">Respond to guests here; exact addresses remain protected until Betna staff approve release.</p>
      {inquiries.length ? <div className="property-list">{inquiries.map((inquiry) => <article className="property-list-item" key={inquiry.id}><div><p className="eyebrow">{inquiry.status}</p><h3>{inquiry.reference}</h3><p>{inquiry.property?.title ?? "Property inquiry"}</p></div></article>)}</div> : <p className="form-help">No inquiries yet.</p>}
    </div>
  );
}
