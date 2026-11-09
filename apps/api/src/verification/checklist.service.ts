import { BadRequestException, Injectable } from "@nestjs/common";
import { Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export type ChecklistAnswers = Record<string, unknown>;

export type ChecklistDefinition = {
  version: number;
  category: string;
  required: string[];
  rules?: Record<string, "PASS" | "FAIL" | "ESCALATE">;
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

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  get(category = "residential"): ChecklistDefinition {
    const normalized = category.trim().toLowerCase();
    return {
      version: this.versions.get(normalized) ?? 1,
      category: normalized,
      required: [...BASELINE, ...(CATEGORY_REQUIREMENTS[normalized] ?? [])],
      rules: Object.fromEntries(
        [...BASELINE, ...(CATEGORY_REQUIREMENTS[normalized] ?? [])].map((key) => [key, "PASS"]),
      ),
    };
  }

  async getPersisted(category = "residential"): Promise<ChecklistDefinition> {
    const normalized = category.trim().toLowerCase();
    const row = await this.prisma?.checklistDefinition?.findFirst?.({
      where: { category: normalized, isPublished: true },
      orderBy: { version: "desc" },
    });
    if (!row) return this.get(normalized);
    const definition = (row.definition ?? {}) as Record<string, unknown>;
    const required = Array.isArray(definition.required)
      ? definition.required.filter((key): key is string => typeof key === "string")
      : this.get(normalized).required;
    const rules = definition.rules && typeof definition.rules === "object"
      ? Object.fromEntries(
          Object.entries(definition.rules).filter(
            ([, value]) => value === "PASS" || value === "FAIL" || value === "ESCALATE",
          ),
        ) as ChecklistDefinition["rules"]
      : this.get(normalized).rules;
    return { category: normalized, version: row.version, required, rules };
  }

  async listDefinitions() {
    return this.prisma?.checklistDefinition?.findMany?.({
      orderBy: [{ category: "asc" }, { version: "desc" }],
    }) ?? [];
  }

  async upsertDefinition(
    category: string,
    input: { required: string[]; rules?: Record<string, string> },
  ) {
    const normalized = category.trim().toLowerCase();
    if (!normalized || !Array.isArray(input.required) || input.required.length === 0) {
      throw new BadRequestException("Checklist category and required items are required");
    }
    const required = [...new Set(input.required.filter((key) => typeof key === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(key)))];
    if (required.length !== input.required.length) {
      throw new BadRequestException("Checklist items must be valid identifiers");
    }
    const rules = Object.fromEntries(
      required.map((key) => [key, input.rules?.[key] ?? "PASS"]),
    );
    for (const value of Object.values(rules)) {
      if (!["PASS", "FAIL", "ESCALATE"].includes(value)) {
        throw new BadRequestException("Checklist rules must be PASS, FAIL, or ESCALATE");
      }
    }
    const current = await this.prisma?.checklistDefinition?.findFirst?.({
      where: { category: normalized },
      orderBy: { version: "desc" },
    });
    const version = (current?.version ?? this.versions.get(normalized) ?? 0) + 1;
    if (!this.prisma?.checklistDefinition?.create) {
      this.versions.set(normalized, version);
      return { category: normalized, version, required, rules };
    }
    await this.prisma.checklistDefinition.updateMany({
      where: { category: normalized, isPublished: true },
      data: { isPublished: false },
    });
    return this.prisma.checklistDefinition.create({
      data: {
        id: randomUUID(),
        category: normalized,
        version,
        definition: { required, rules },
        isPublished: true,
      },
    });
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
    return definition.required.filter((key) => !this.answerPasses(answers[key]));
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

  answerPasses(answer: unknown) {
    return answer === true || (typeof answer === "object" && answer !== null && (answer as any).status === "PASS");
  }

  answerRecorded(answer: unknown) {
    return answer === true || (typeof answer === "object" && answer !== null && ["PASS", "FAIL", "ESCALATE"].includes(String((answer as any).status)));
  }
}
