"use client";

type OfferingFormProps = {
  currency: "KES" | "UGX";
  initialProperty?: any;
};

export function OfferingForm({ currency, initialProperty }: OfferingFormProps) {
  const offerings = initialProperty?.offerings ?? [];
  const shortStay = offerings.find(
    (offering: any) => offering.mode === "SHORT_STAY",
  );
  const longTerm = offerings.find(
    (offering: any) => offering.mode === "LONG_TERM",
  );
  return (
    <fieldset className="form-section">
      <legend>Rental options</legend>
      <p className="form-help">
        Keep short-stay and long-term prices separate. Prices are shown in local
        currency. Add at least one public price.
      </p>
      <div className="offering-grid">
        <div className="offering-card">
          <h3>Short stay</h3>
          <label htmlFor="short-stay-price">
            Short-stay public price ({currency})
          </label>
          <input
            id="short-stay-price"
            name="shortStayPrice"
            type="number"
            min="1"
            defaultValue={shortStay?.basePrice ?? ""}
          />
          <label htmlFor="short-stay-minimum">Minimum nights</label>
          <input
            id="short-stay-minimum"
            name="shortStayMinimumNights"
            type="number"
            min="1"
            defaultValue={shortStay?.minimumNights ?? 1}
          />
        </div>
        <div className="offering-card">
          <h3>Long term</h3>
          <label htmlFor="long-term-price">
            Long-term public price ({currency})
          </label>
          <input
            id="long-term-price"
            name="longTermPrice"
            type="number"
            min="1"
            defaultValue={longTerm?.basePrice ?? ""}
          />
          <label htmlFor="long-term-duration">Lease duration (months)</label>
          <input
            id="long-term-duration"
            name="longTermLeaseDuration"
            type="number"
            min="1"
            defaultValue={longTerm?.leaseDurationMonths ?? 12}
          />
        </div>
      </div>
    </fieldset>
  );
}
