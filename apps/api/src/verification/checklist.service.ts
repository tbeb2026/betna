import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export type ChecklistAnswers = Record<string, unknown>;

export type ChecklistDefinition = {
  version: number;
  category: string;
  required: string[];
  rules?: Record<string, "PASS" | "FAIL" | "ESCALATE">;
};

@Injectable()
export class ChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  async getPersisted(category = "residential", version?: number): Promise<ChecklistDefinition> {
    const normalized = category.trim().toLowerCase();
    if (!normalized) throw new BadRequestException("Checklist category is required");
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      throw new BadRequestException("Checklist version must be a positive integer");
    }
    const store = (this.prisma as any)?.checklistDefinition;
    if (!store?.findFirst) {
      throw new InternalServerErrorException("Checklist definitions are not configured");
    }
    const query = version === undefined
      ? { where: { category: normalized, isPublished: true }, orderBy: { version: "desc" } }
      : { where: { category: normalized, version } };
    const row = await store.findFirst(query);
    if (!row) {
      throw new InternalServerErrorException(
        version === undefined
          ? `No published checklist definition is configured for ${normalized}`
          : `Checklist definition ${normalized} v${version} is not configured`,
      );
    }
    const definition = (row.definition ?? {}) as Record<string, unknown>;
    const required = Array.isArray(definition.required)
      ? definition.required.filter((key): key is string => typeof key === "string")
      : [];
    if (required.length === 0) {
      throw new InternalServerErrorException(`Checklist definition ${normalized} v${row.version} is invalid`);
    }
    const rules = definition.rules && typeof definition.rules === "object"
      ? Object.fromEntries(
          Object.entries(definition.rules).filter(
            ([, value]) => value === "PASS" || value === "FAIL" || value === "ESCALATE",
          ),
        ) as ChecklistDefinition["rules"]
      : undefined;
    return { category: normalized, version: row.version, required, rules };
  }

  async listDefinitions() {
    const store = (this.prisma as any)?.checklistDefinition;
    if (!store?.findMany) throw new InternalServerErrorException("Checklist definitions are not configured");
    return store.findMany({
      orderBy: [{ category: "asc" }, { version: "desc" }],
    });
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
    const store = (this.prisma as any)?.checklistDefinition;
    if (!store?.findFirst || !store?.create || !store?.updateMany) {
      throw new InternalServerErrorException("Checklist definitions are not configured");
    }
    const current = await store.findFirst({
      where: { category: normalized },
      orderBy: { version: "desc" },
    });
    const version = (current?.version ?? 0) + 1;
    await store.updateMany({
      where: { category: normalized, isPublished: true },
      data: { isPublished: false },
    });
    return store.create({
      data: {
        id: randomUUID(),
        category: normalized,
        version,
        definition: { required, rules },
        isPublished: true,
      },
    });
  }

  get(category = "residential"): Promise<ChecklistDefinition> {
    return this.getPersisted(category);
  }

  async missing(category: string, answers: ChecklistAnswers = {}) {
    const definition = await this.getPersisted(category);
    return definition.required.filter((key) => !this.answerPasses(answers[key]));
  }

  async assertComplete(category: string, answers: ChecklistAnswers = {}) {
    const missing = await this.missing(category, answers);
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
