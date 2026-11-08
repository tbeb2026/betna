import { getPublicProperties } from "../../../../../features/search/data";
import { PropertyCard } from "../../../../../features/search/property-card";

export default async function CityPage({ params }: { params: Promise<{ locale: string; country: string; city: string }> }) {
  const { locale, country, city } = await params;
  const properties = await getPublicProperties({ locale, country, city });
  return (
    <section className="search-page">
      <div className="search-intro"><p className="eyebrow">{country.toUpperCase()}</p><h1>Verified places in {city.replaceAll("-", " ")}</h1><p className="lede">Explore Betna-inspected places with approximate map locations.</p></div>
      {properties.length ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div> : <p className="empty-state">No published places are available in this city.</p>}
    </section>
  );
}
