import { AdminReviewActions } from "../../../../features/verification/admin-review-actions";
import { getAdminReviewQueue } from "../../../../features/verification/verification-data";
import { getSession } from "../../../../lib/auth";

export default async function AdminVerificationPage() {
  const [queue, session] = await Promise.all([getAdminReviewQueue(), getSession()]);
  return (
    <div className="portal-card">
      <p className="eyebrow">Verification review</p>
      <h2>Inspection review queue</h2>
      <p className="form-help">Reports become reviewable only after required checklist answers and evidence synchronization pass.</p>
      {queue.length ? (
        <div className="property-list">
          {queue.map((inspection) => (
            <article className="property-list-item" key={inspection.id}>
              <div>
                <p className="eyebrow">Ready for review</p>
                <h3>{inspection.property?.title ?? inspection.id}</h3>
                <p className="form-help">{inspection.property?.category ?? "Property inspection"}</p>
              </div>
              <AdminReviewActions inspectionId={inspection.id} />
            </article>
          ))}
        </div>
      ) : <p className="form-help">No synchronized inspections are waiting for review.</p>}
    </div>
  );
}
