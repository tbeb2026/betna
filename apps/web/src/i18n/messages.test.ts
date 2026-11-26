import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import en from "./messages/en.json";
import ti from "./messages/ti.json";

function paths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key));
}

describe("locale catalog parity", () => {
  it("localizes every admin conversion and commission status without falling back", () => {
    const statuses = [
      "REPORTED",
      "EVIDENCE_PENDING",
      "VERIFIED",
      "CANCELLED",
      "CONFIRMED",
      "COMMISSION_DUE",
      "PAID",
      "WAIVED",
      "DISPUTED",
    ];

    for (const status of statuses) {
      const english = (en.portal.statuses as Record<string, string>)[status];
      const tigrinya = (ti.portal.statuses as Record<string, string>)[status];
      expect(english, `English ${status}`).toBeTruthy();
      expect(tigrinya, `Tigrinya ${status}`).toBeTruthy();
      expect(english, `English ${status}`).not.toBe(en.portal.statuses.UNPUBLISHED);
      expect(tigrinya, `Tigrinya ${status}`).not.toBe(ti.portal.statuses.UNPUBLISHED);
    }
  });

  it("contains every user-visible English key in Tigrinya", () => {
    expect(paths(ti)).toEqual(expect.arrayContaining(paths(en)));
  });

  it("contains catalogs for every audited marketplace surface", () => {
    const required = [
      "search.filters.ariaLabel",
      "search.filters.everyCountry",
      "search.filters.everyCategory",
      "search.filters.minimumPrice",
      "search.filters.maximumPrice",
      "search.filters.apply",
      "search.mode.legend",
      "search.mode.all",
      "search.page.eyebrow",
      "search.page.title",
      "search.page.description",
      "search.page.mapLabel",
      "search.page.mapDescription",
      "search.page.empty",
      "publicProperty.priceOnRequest",
      "publicProperty.verifiedPlace",
      "publicProperty.viewProperty",
      "publicProperty.contactMessage",
      "publicProperty.emailSubject",
      "portal.ownerInquiries.eyebrow",
      "portal.ownerInquiries.title",
      "portal.ownerInquiries.description",
      "portal.ownerInquiries.empty",
      "portal.ownerInquiries.propertyFallback",
      "portal.inspection.eyebrow",
      "portal.inspection.title",
      "portal.inspection.notes",
      "portal.inspection.evidence",
      "portal.inspection.checklist",
      "portal.inspection.chooseResult",
      "portal.inspection.pass",
      "portal.inspection.fail",
      "portal.inspection.escalate",
      "portal.inspection.saveDraft",
      "portal.inspection.submit",
      "portal.inspection.retry",
      "portal.availability.title",
      "portal.availability.propertyId",
      "portal.availability.startDate",
      "portal.availability.endDate",
      "portal.availability.reason",
      "portal.availability.save",
      "portal.availability.update",
      "portal.availability.remove",
    ];
    for (const key of required) {
      expect(paths(en), key).toContain(key);
      expect(paths(ti), key).toContain(key);
    }
  });

  it("translates audited visible English strings instead of echoing them", () => {
    const keys = [
      "search.page.title",
      "search.filters.apply",
      "publicProperty.viewProperty",
      "portal.ownerInquiries.title",
      "portal.inspection.title",
      "portal.availability.title",
    ];
    for (const key of keys) {
      const read = (catalog: unknown) => key.split(".").reduce((value: any, part) => value?.[part], catalog);
      expect(read(ti), key).not.toBe(read(en));
    }
  });

  it("keeps audited render surfaces free of visible English literals", () => {
    const files = [
      "../features/search/filters.tsx",
      "../features/search/mode-switch.tsx",
      "../features/search/property-card.tsx",
      "../features/inquiries/owner-inquiry-actions.tsx",
      "../features/verification/inspection-form.tsx",
      "../features/availability/unavailable-date-editor.tsx",
    ];
    const forbidden = ["Apply filters", "Every country", "Rental mode", "View property", "Inspection form", "Save draft", "Unavailable dates saved."];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const literal of forbidden) expect(source, `${file} still contains ${literal}`).not.toContain(literal);
    }
  });
});
