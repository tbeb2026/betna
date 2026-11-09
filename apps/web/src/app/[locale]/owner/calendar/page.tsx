import { createApiClient } from "../../../../lib/api-client";
import { requireRole } from "../../../../lib/auth";
import { UnavailableDateEditor } from "../../../../features/availability/unavailable-date-editor";
import { getTranslations } from "next-intl/server";

export default async function OwnerCalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.availability" });
  const session = await requireRole("OWNER", locale);
  const api = createApiClient({ token: session.token });
  const [blocks, unavailableDates] = await Promise.all([
    api.get<any[]>("/owner/availability").catch(() => []),
    api.get<any[]>("/owner/availability/unavailable").catch(() => []),
  ]);
  return (
    <div className="portal-card">
      <h2>{t("title")}</h2>
      <p>{t("description")}</p>
      <UnavailableDateEditor initialDates={unavailableDates} />
      {blocks.length ? (
        <div className="property-list">
          {blocks.map((block) => (
            <article className="property-list-item" key={block.id}>
              <div><p className="eyebrow">{block.property?.title ?? t("property")}</p><h3>{block.startDate} – {block.endDate}</h3><p>{block.inquiry?.reference ?? t("confirmedInquiry")}</p></div>
            </article>
          ))}
        </div>
      ) : <p className="form-help">{t("empty")}</p>}
    </div>
  );
}
