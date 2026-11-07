"use client";

type OfferingFormProps = {
  currency: "KES" | "UGX";
};

export function OfferingForm({ currency }: OfferingFormProps) {
  return (
    <fieldset className="form-section">
      <legend>Rental options</legend>
      <p className="form-help">Keep short-stay and long-term prices separate. Prices are shown in local currency.</p>
      <div className="offering-grid">
        <div className="offering-card">
          <h3>Short stay</h3>
          <label htmlFor="short-stay-price">Short-stay public price ({currency})</label>
          <input id="short-stay-price" name="shortStayPrice" type="number" min="1" required />
          <label htmlFor="short-stay-minimum">Minimum nights</label>
          <input id="short-stay-minimum" name="shortStayMinimumNights" type="number" min="1" defaultValue="1" />
        </div>
        <div className="offering-card">
          <h3>Long term</h3>
          <label htmlFor="long-term-price">Long-term public price ({currency})</label>
          <input id="long-term-price" name="longTermPrice" type="number" min="1" required />
          <label htmlFor="long-term-duration">Lease duration (months)</label>
          <input id="long-term-duration" name="longTermLeaseDuration" type="number" min="1" defaultValue="12" />
        </div>
      </div>
    </fieldset>
  );
}
