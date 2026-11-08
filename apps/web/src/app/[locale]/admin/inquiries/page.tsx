import { createApiClient } from "../../../../lib/api-client";
import { getSession } from "../../../../lib/auth";

export default async function AdminInquiriesPage() {
  const session = await getSession();
  const inquiries = session ? await createApiClient({ token: session.token }).get<any[]>("/admin/inquiries").catch(() => []) : [];
  return (
    <div className="portal-card">
      <p className="eyebrow">Inquiry operations</p>
      <h2>Managed guest inquiries</h2>
      <p className="form-help">Review legitimacy before releasing exact locations. Every release is audited.</p>
      {inquiries.length ? <div className="property-list">{inquiries.map((inquiry) => <article className="property-list-item" key={inquiry.id}><div><p className="eyebrow">{inquiry.status}</p><h3>{inquiry.reference}</h3><p>{inquiry.property?.title ?? "Property inquiry"}</p></div>{inquiry.status !== "LOCATION_APPROVED" ? <span className="form-help">Location release available in API</span> : <span className="verification-badge">Location released</span>}</article>)}</div> : <p className="form-help">No inquiries waiting for review.</p>}
    </div>
  );
}
