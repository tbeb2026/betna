"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { OfferingForm } from "./offering-form";

type PropertyFormProps = {
  propertyId?: string;
};

export function PropertyForm({ propertyId }: PropertyFormProps) {
  const [country, setCountry] = useState<"KE" | "UG">("KE");
  const [saved, setSaved] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>, action: "draft" | "review") {
    event.preventDefault();
    setSaved(action === "review" ? "Your place is ready for Betna review." : "Draft saved.");
  }

  const currency = country === "KE" ? "KES" : "UGX";
  return (
    <form className="property-form" onSubmit={(event) => handleSubmit(event, "draft")}>
      <input type="hidden" name="propertyId" value={propertyId ?? ""} />
      <fieldset className="form-section">
        <legend>Place details</legend>
        <label htmlFor="property-title">Property title</label>
        <input id="property-title" name="title" type="text" placeholder="A clear name for your place" required />
        <label htmlFor="property-description">Description</label>
        <textarea id="property-description" name="description" rows={4} required />
        <label htmlFor="property-country">Country</label>
        <select id="property-country" name="countryCode" value={country} onChange={(event) => setCountry(event.target.value as "KE" | "UG")}>
          <option value="KE">Kenya ({"KES"})</option>
          <option value="UG">Uganda ({"UGX"})</option>
        </select>
        <label htmlFor="property-category">Category</label>
        <select id="property-category" name="category" defaultValue="residential">
          <option value="residential">Residential</option>
          <option value="land">Land</option>
          <option value="commercial">Commercial</option>
        </select>
        <label htmlFor="property-subcategory">Subcategory</label>
        <select id="property-subcategory" name="subcategory" defaultValue="apartment">
          <option value="apartment">Apartment</option>
          <option value="house">House</option>
          <option value="room">Room</option>
          <option value="furnished_stay">Furnished stay</option>
          <option value="guesthouse">Guesthouse</option>
          <option value="vacation_home">Vacation home</option>
          <option value="office">Office</option>
          <option value="shop">Shop</option>
          <option value="warehouse">Warehouse</option>
          <option value="commercial_space">Commercial space</option>
          <option value="land">Land</option>
          <option value="other">Other</option>
        </select>
      </fieldset>

      <fieldset className="form-section">
        <legend>Location</legend>
        <p className="form-help">Visitors see only an approximate area. The exact address stays private for Betna verification.</p>
        <label htmlFor="public-location">Public area or neighborhood</label>
        <input id="public-location" name="publicLocationLabel" type="text" required />
        <label htmlFor="exact-address">Exact address (private)</label>
        <input id="exact-address" name="exactAddress" type="text" required />
      </fieldset>

      <OfferingForm currency={currency} />

      <fieldset className="form-section">
        <legend>Authorization</legend>
        <label className="check-label" htmlFor="authorization-attested">
          <input id="authorization-attested" name="authorizationAttested" type="checkbox" required />
          I confirm that I own or am authorized to list this place
        </label>
      </fieldset>

      {saved ? <p className="form-success" role="status">{saved}</p> : null}
      <div className="actions">
        <button className="button secondary" type="submit">Save draft</button>
        <button className="button primary" type="button" onClick={(event) => handleSubmit(event as unknown as FormEvent<HTMLFormElement>, "review")}>Submit for review</button>
      </div>
    </form>
  );
}
