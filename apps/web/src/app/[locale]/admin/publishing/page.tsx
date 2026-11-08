import { cookies } from "next/headers";
import { createApiClient } from "../../../../lib/api-client";

type QueueItem = {
  id: string;
  title: string;
  status: string;
  category?: string;
  verificationValidUntil?: string;
};

async function getQueue(): Promise<QueueItem[]> {
  const token = (await cookies()).get("betna_session")?.value;
  if (!token) return [];
  try {
    return await createApiClient({ token, baseUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL }).get<QueueItem[]>("/admin/publishing");
  } catch {
    return [];
  }
}

export default async function AdminPublishingPage() {
  const queue = await getQueue();
  return (
    <div className="portal-card">
      <p className="eyebrow">Publishing</p>
      <h2>Listing lifecycle queue</h2>
      <p className="form-help">Publish only listings with a current approved inspection. Paused and fraud-review listings stay hidden from public discovery.</p>
      {queue.length ? (
        <div className="property-list">
          {queue.map((property) => (
            <article className="property-list-item" key={property.id}>
              <div>
                <p className="eyebrow">{property.status.replaceAll("_", " ")}</p>
                <h3>{property.title}</h3>
                <p className="form-help">{property.category ?? "Property"}</p>
              </div>
              <span className="form-help">{property.verificationValidUntil ? `Verified until ${new Date(property.verificationValidUntil).toLocaleDateString()}` : "Needs verification"}</span>
            </article>
          ))}
        </div>
      ) : <p className="form-help">No listings are waiting for a publication decision.</p>}
    </div>
  );
}
