import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

type Actor = {
  id: string;
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
};

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(inspectionId: string, verifierId: string, actor: Actor) {
    this.assertRole(actor, "ADMIN");
    if (
      typeof this.prisma.inspection?.findUnique !== "function" ||
      typeof this.prisma.user?.findUnique !== "function" ||
      typeof this.prisma.inspection?.update !== "function"
    ) {
      throw new ForbiddenException("Assignment authorization is unavailable");
    }
    const [inspection, verifier] = await Promise.all([
      this.prisma.inspection.findUnique({ where: { id: inspectionId } }),
      this.prisma.user.findUnique({
        where: { id: verifierId },
        include: {
          roles: { include: { role: true } },
          territoryAssignments: true,
        },
      }),
    ]);
    if (!inspection) throw new NotFoundException("Inspection not found");
    if (!verifier) throw new NotFoundException("Verifier not found");
    if (!this.roles(verifier).includes("VERIFIER")) {
      throw new ForbiddenException("Only verifiers can receive inspections");
    }
    const territories = this.territories(verifier);
    if (
      !inspection.territoryId ||
      !territories.includes(inspection.territoryId)
    ) {
      throw new ForbiddenException(
        "Verifier is outside the inspection territory",
      );
    }
    return this.prisma.inspection.update({
      where: { id: inspectionId },
      data: { verifierId, status: "DRAFT" },
      include: { evidence: true, property: true },
    });
  }

  async listForVerifier(verifierId: string, territoryIds?: string[]) {
    let allowedTerritories = territoryIds;
    if (!allowedTerritories) {
      if (typeof this.prisma.user?.findUnique !== "function") {
        throw new ForbiddenException("Assignment authorization is unavailable");
      }
      const verifier = await this.prisma.user.findUnique({
        where: { id: verifierId },
        include: { territoryAssignments: true },
      });
      allowedTerritories = this.territories(verifier);
    }
    const where: Record<string, unknown> = {
      verifierId,
      territoryId: { in: allowedTerritories },
    };
    if (typeof this.prisma.inspection?.findMany !== "function") {
      throw new ForbiddenException("Assignment authorization is unavailable");
    }
    return this.prisma.inspection.findMany({
      where,
      include: { property: true, evidence: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createAssignment(inspection: any, verifierId: string) {
    return this.prisma.inspection.update({
      where: { id: inspection.id ?? randomUUID() },
      data: { verifierId },
    });
  }

  assertVerifierTerritory(
    verifier: any,
    territoryId: string | null | undefined,
  ) {
    if (!territoryId || !this.territories(verifier).includes(territoryId)) {
      throw new ForbiddenException(
        "Verifier is outside the inspection territory",
      );
    }
  }

  private assertRole(actor: Actor, required: string) {
    if (!this.roles(actor).includes(required)) {
      throw new ForbiddenException("Admin access is required");
    }
  }

  private roles(actor: any): string[] {
    return (actor?.roles ?? [])
      .map((entry: any) =>
        typeof entry === "string" ? entry : (entry?.name ?? entry?.role?.name),
      )
      .filter(Boolean)
      .map((role: string) => role.toUpperCase());
  }

  private territories(verifier: any): string[] {
    return [
      ...(verifier?.territoryIds ?? []),
      ...(verifier?.territoryAssignments ?? []).map((entry: any) =>
        typeof entry === "string" ? entry : (entry?.territoryId ?? entry?.id),
      ),
    ].filter(Boolean);
  }
}
