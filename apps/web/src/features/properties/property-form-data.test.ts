import { describe, expect, it } from "vitest";
import { propertyInputFromFormData } from "./property-form-data";

const cities = [
  {
    id: "city-ke-nairobi",
    name: "Nairobi",
    slug: "nairobi",
    countryCode: "KE" as const,
  },
];

function validForm() {
  const form = new FormData();
  form.set("title", "Kilimani garden apartment");
  form.set("description", "A bright place near the market.");
  form.set("countryCode", "KE");
  form.set("cityId", "city-ke-nairobi");
  form.set("category", "residential");
  form.set("subcategory", "apartment");
  form.set("publicLocationLabel", "Kilimani, Nairobi");
  form.set("publicLatitude", "-1.2921");
  form.set("publicLongitude", "36.7875");
  form.set("exactAddress", "12 Example Lane, Kilimani, Nairobi");
  form.set("exactLatitude", "-1.292112");
  form.set("exactLongitude", "36.787511");
  form.set("shortStayPrice", "6500");
  form.set("shortStayMinimumNights", "2");
  form.set("longTermPrice", "120000");
  form.set("longTermLeaseDuration", "12");
  form.set("authorizationAttested", "on");
  return form;
}

describe("owner property form payload", () => {
  it("derives a typed API payload with managed city and numeric coordinates", () => {
    expect(propertyInputFromFormData(validForm(), cities)).toEqual({
      title: "Kilimani garden apartment",
      description: "A bright place near the market.",
      countryCode: "KE",
      cityId: "city-ke-nairobi",
      category: "residential",
      subcategory: "apartment",
      publicLocation: {
        label: "Kilimani, Nairobi",
        latitude: -1.2921,
        longitude: 36.7875,
      },
      exactLocation: {
        address: "12 Example Lane, Kilimani, Nairobi",
        latitude: -1.292112,
        longitude: 36.787511,
      },
      authorizationAttested: true,
      offerings: [
        {
          mode: "SHORT_STAY",
          currency: "KES",
          basePrice: 6500,
          minimumNights: 2,
        },
        {
          mode: "LONG_TERM",
          currency: "KES",
          basePrice: 120000,
          leaseDurationMonths: 12,
        },
      ],
    });
  });

  it("rejects a city that is not managed for the selected country", () => {
    const form = validForm();
    form.set("cityId", "city-ug-kampala");

    expect(() => propertyInputFromFormData(form, cities)).toThrow(/city/i);
  });
});
