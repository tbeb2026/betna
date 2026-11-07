import { Injectable } from "@nestjs/common";

export interface TaxonomyCategory {
  category: string;
  label: string;
  subcategories: Array<{ value: string; label: string }>;
}
const TAXONOMY: TaxonomyCategory[] = [
  {
    category: "residential",
    label: "Residential",
    subcategories: [
      { value: "apartment", label: "Apartment" },
      { value: "house", label: "House" },
      { value: "room", label: "Room" },
      { value: "furnished_stay", label: "Furnished stay" },
      { value: "guesthouse", label: "Guesthouse" },
      { value: "vacation_home", label: "Vacation home" },
    ],
  },
  {
    category: "land",
    label: "Land",
    subcategories: [{ value: "land", label: "Land" }],
  },
  {
    category: "commercial",
    label: "Commercial",
    subcategories: [
      { value: "office", label: "Office" },
      { value: "shop", label: "Shop" },
      { value: "warehouse", label: "Warehouse" },
      { value: "commercial_space", label: "Commercial space" },
      { value: "other", label: "Other" },
    ],
  },
];

@Injectable()
export class TaxonomyService {
  list(): TaxonomyCategory[] {
    return TAXONOMY.map((entry) => ({
      ...entry,
      subcategories: entry.subcategories.map((subcategory) => ({
        ...subcategory,
      })),
    }));
  }

  isManaged(category: string, subcategory?: string): boolean {
    const group = TAXONOMY.find((entry) => entry.category === category);
    if (!group) return false;
    return (
      Boolean(subcategory) &&
      group.subcategories.some((item) => item.value === subcategory)
    );
  }

  assertManaged(category: string, subcategory?: string): void {
    if (!this.isManaged(category, subcategory)) {
      throw new Error(
        `Unsupported property taxonomy: ${category}/${subcategory ?? ""}`,
      );
    }
  }
}
