"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type Offering = {
  mode: "SHORT_STAY" | "LONG_TERM" | string;
  currency: string;
  basePrice: number;
  minimumNights?: number | null;
  leaseDurationMonths?: number | null;
};

export function resolveSelectedMode(modes: string[], selectedMode: string) {
  return modes.includes(selectedMode) ? selectedMode : modes[0] ?? "SHORT_STAY";
}

export function PropertyOfferings({ offerings }: { offerings: Offering[] }) {
  const t = useTranslations("publicProperty");
  const modes = useMemo(() => [...new Set(offerings.map((offering) => offering.mode))], [offerings]);
  const [selectedMode, setSelectedMode] = useState(modes[0] ?? "SHORT_STAY");
  const activeMode = resolveSelectedMode(modes, selectedMode);
  const selected = offerings.filter((offering) => offering.mode === activeMode);
  return (
    <div>
      <div className="mode-switch" aria-label={t("rentalMode")}>
        {(["SHORT_STAY", "LONG_TERM"] as const).filter((mode) => modes.includes(mode)).map((mode) => (
          <button key={mode} className="button" type="button" aria-pressed={activeMode === mode} onClick={() => setSelectedMode(mode)}>
            {mode === "LONG_TERM" ? t("longTerm") : t("shortStay")}
          </button>
        ))}
      </div>
      <div className="offering-grid">
        {selected.map((offering) => (
          <div className="offering-card" key={`${offering.mode}-${offering.currency}`}>
            <h3>{offering.mode === "LONG_TERM" ? t("longTerm") : t("shortStay")}</h3>
            <strong>{offering.currency} {offering.basePrice.toLocaleString()}</strong>
            {offering.minimumNights ? <span>{t("minimumNights", { count: offering.minimumNights })}</span> : null}
            {offering.leaseDurationMonths ? <span>{t("leaseDuration", { count: offering.leaseDurationMonths })}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
