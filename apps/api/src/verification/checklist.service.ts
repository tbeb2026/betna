import { BadRequestException, Injectable } from "@nestjs/common";

export type ChecklistAnswers = Record<string, unknown>;

export type ChecklistDefinition = {
  version: number;
  category: string;
  required: string[];
};

const BASELINE = [
  "identityAuthorization",
  "exactLocation",
  "currentPhotos",
  "statedPrice",
  "category",
  "safetyCondition",
] as const;

const CATEGORY_REQUIREMENTS: Record<string, string[]> = {
  residential: ["residentialUtilities"],
  land: ["landBoundaries", "landAccess"],
  commercial: ["commercialUse", "commercialSafety"],
};

@Injectable()
export class ChecklistService {
  private readonly versions = new Map<string, number>();

  get(category = "residential"): ChecklistDefinition {
    const normalized = category.trim().toLowerCase();
    return {
      version: this.versions.get(normalized) ?? 1,
      category: normalized,
      required: [...BASELINE, ...(CATEGORY_REQUIREMENTS[normalized] ?? [])],
    };
  }

  version(category: string, version?: number) {
    const normalized = category.trim().toLowerCase();
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      throw new BadRequestException(
        "Checklist version must be a positive integer",
      );
    }
    if (version !== undefined) this.versions.set(normalized, version);
    return this.get(normalized);
  }

  missing(category: string, answers: ChecklistAnswers = {}) {
    const definition = this.get(category);
    return definition.required.filter((key) => answers[key] !== true);
  }

  assertComplete(category: string, answers: ChecklistAnswers = {}) {
    const missing = this.missing(category, answers);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Required inspection checklist items are incomplete: ${missing.join(", ")}`,
      );
    }
    return true;
  }
}
