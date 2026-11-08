import { createApiClient } from "../../../../lib/api-client";
import { requireRole } from "../../../../lib/auth";

export default async function OwnerCalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireRole("OWNER", locale);
  const blocks = await createApiClient({ token: session.token }).get<any[]>("/owner/availability").catch(() => []);
  return (
    <div className="portal-card">
      <h2>Availability calendar</h2>
      <p>Confirmed short stays block these dates automatically.</p>
      {blocks.length ? (
        <div className="property-list">
          {blocks.map((block) => (
            <article className="property-list-item" key={block.id}>
              <div><p className="eyebrow">{block.property?.title ?? "Property"}</p><h3>{block.startDate} – {block.endDate}</h3><p>{block.inquiry?.reference ?? "Confirmed inquiry"}</p></div>
            </article>
          ))}
        </div>
      ) : <p className="form-help">No confirmed dates yet.</p>}
    </div>
  );
}
