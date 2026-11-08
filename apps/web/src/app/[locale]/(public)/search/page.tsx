import { Filters, type SearchFilterValues } from "../../../../features/search/filters";
import { getPublicProperties } from "../../../../features/search/data";
import { PropertyCard } from "../../../../features/search/property-card";

type SearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  const raw = await searchParams;
  const values: SearchFilterValues = { country: first(raw.country), city: first(raw.city), category: first(raw.category), minPrice: first(raw.minPrice), maxPrice: first(raw.maxPrice), mode: first(raw.mode) };
  const properties = await getPublicProperties({ ...values, locale });
  return (
    <section className="search-page">
      <div className="search-intro"><p className="eyebrow">Betna discovery</p><h1>Find a verified place</h1><p className="lede">Browse approximate locations and local prices for places inspected by Betna.</p></div>
      <Filters locale={locale} values={values} />
      <div className="map-summary" aria-label="Approximate map area"><span>Approximate map display</span><span>Exact addresses remain protected until managed release.</span></div>
      {properties.length ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div> : <p className="empty-state">No published places match these filters.</p>}
    </section>
  );
}
