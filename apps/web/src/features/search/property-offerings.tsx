"use client";

import { useMemo, useState } from "react";

type Offering = {
  mode: "SHORT_STAY" | "LONG_TERM" | string;
  currency: string;
  basePrice: number;
  minimumNights?: number | null;
  leaseDurationMonths?: number | null;
};

export function PropertyOfferings({ offerings }: { offerings: Offering[] }) {
  const modes = useMemo(() => [...new Set(offerings.map((offering) => offering.mode))], [offerings]);
  const [selectedMode, setSelectedMode] = useState(modes[0] ?? "SHORT_STAY");
  const selected = offerings.filter((offering) => offering.mode === selectedMode);
  return (
    <div>
      <div className="mode-switch" aria-label="Rental mode">
        {(["SHORT_STAY", "LONG_TERM"] as const).filter((mode) => modes.includes(mode)).map((mode) => (
          <button key={mode} className="button" type="button" aria-pressed={selectedMode === mode} onClick={() => setSelectedMode(mode)}>
            {mode === "LONG_TERM" ? "Long-term" : "Short-stay"}
          </button>
        ))}
      </div>
      <div className="offering-grid">
        {selected.map((offering) => (
          <div className="offering-card" key={`${offering.mode}-${offering.currency}`}>
            <h3>{offering.mode === "LONG_TERM" ? "Long-term" : "Short-stay"}</h3>
            <strong>{offering.currency} {offering.basePrice.toLocaleString()}</strong>
            {offering.minimumNights ? <span>Minimum {offering.minimumNights} nights</span> : null}
            {offering.leaseDurationMonths ? <span>{offering.leaseDurationMonths}-month lease</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
