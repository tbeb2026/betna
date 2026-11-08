"use client";

import { ModeSwitch } from "./mode-switch";

export type SearchFilterValues = { country?: string; city?: string; category?: string; minPrice?: string; maxPrice?: string; mode?: string };

export function Filters({ locale, values }: { locale: string; values: SearchFilterValues }) {
  return (
    <form className="search-filters" action={`/${locale}/search`} method="get" aria-label="Property filters">
      <label>Country<select name="country" defaultValue={values.country ?? ""}><option value="">Every country</option><option value="KE">Kenya</option><option value="UG">Uganda</option></select></label>
      <label>City<input name="city" defaultValue={values.city ?? ""} placeholder="nairobi" /></label>
      <label>Category<select name="category" defaultValue={values.category ?? ""}><option value="">Every category</option><option value="residential">Residential</option><option value="land">Land</option><option value="commercial">Commercial</option></select></label>
      <label>Minimum price<input name="minPrice" inputMode="decimal" type="number" min="0" defaultValue={values.minPrice ?? ""} /></label>
      <label>Maximum price<input name="maxPrice" inputMode="decimal" type="number" min="0" defaultValue={values.maxPrice ?? ""} /></label>
      <ModeSwitch value={values.mode} />
      <button className="button primary" type="submit">Apply filters</button>
    </form>
  );
}
