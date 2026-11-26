import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notifications.service";

type Actor = {
  id: string;
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
};

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit?: AuditService, private readonly notifications?: NotificationService) {}

  async assign(inspectionId: string, verifierId: string, actor: Actor) {
    this.assertRole(actor, "ADMIN");
    if (
      typeof this.prisma.inspection?.findUnique !== "function" ||
      typeof this.prisma.user?.findUnique !== "function" ||
      typeof this.prisma.inspection?.update !== "function"
    ) {
      throw new ForbiddenException("Assignment authorization is unavailable");
    }
    const result = await this.withTransaction(async (tx: any) => {
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inspection" WHERE "id" = ${inspectionId} FOR UPDATE`);
      }
      const [inspection, verifier] = await Promise.all([
        tx.inspection.findUnique({ where: { id: inspectionId } }),
        tx.user.findUnique({
          where: { id: verifierId },
          include: {
            roles: { include: { role: true } },
            territoryAssignments: true,
          },
        }),
      ]);
      if (!inspection) throw new NotFoundException("Inspection not found");
      if (["APPROVED", "REJECTED", "EXPIRED"].includes(inspection.status)) {
        throw new ConflictException("Terminal inspections cannot be assigned");
      }
      if (!verifier) throw new NotFoundException("Verifier not found");
      if (!this.roles(verifier).includes("VERIFIER")) {
        throw new ForbiddenException("Only verifiers can receive inspections");
      }
      const territories = this.territories(verifier);
      if (!inspection.territoryId || !territories.includes(inspection.territoryId)) {
        throw new ForbiddenException("Verifier is outside the inspection territory");
      }
      const updated = await tx.inspection.update({
        where: { id: inspectionId },
        data: { verifierId, status: "DRAFT" },
        include: { evidence: true, property: true },
      });
      await this.recordAudit(tx, actor, "INSPECTION_VERIFIER_ASSIGNED", inspectionId, { verifierId, previousVerifierId: inspection.verifierId ?? null });
      return updated;
    });
    if (this.notifications) {
      const recipient = await (this.prisma as any).user?.findUnique?.({ where: { id: verifierId }, select: { id: true, email: true, phone: true, preferredLocale: true } });
      if (recipient) {
        await this.notifications.enqueue({
          type: "INSPECTION_ASSIGNED",
          messageKey: "verification.assigned",
          idempotencyKey: `inspection-assigned:${inspectionId}:${verifierId}`,
          recipients: [{ userId: recipient.id, email: recipient.email, phone: recipient.phone, locale: recipient.preferredLocale ?? "en" }],
          payload: { inspectionId, propertyId: result.propertyId, status: result.status },
          channels: ["IN_APP", "EMAIL", "WHATSAPP"],
        });
      }
    }
    return result;
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

  async listEligibleVerifiers(inspectionId: string) {
    if (
      typeof this.prisma.inspection?.findUnique !== "function" ||
      typeof this.prisma.user?.findMany !== "function"
    ) {
      throw new ForbiddenException("Assignment authorization is unavailable");
    }
    const inspection = await this.prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { id: true, territoryId: true },
    });
    if (!inspection) throw new NotFoundException("Inspection not found");
    const territoryId = inspection.territoryId;
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      include: {
        roles: { include: { role: true } },
        territoryAssignments: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return (users ?? [])
      .filter((user: any) =>
        user.status === "ACTIVE" &&
        this.roles(user).includes("VERIFIER") &&
        Boolean(territoryId) &&
        this.territories(user).includes(territoryId as string),
      )
      .map((user: any) => ({
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id,
        email: user.email ?? null,
      }));
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

  private async withTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    if (typeof (this.prisma as any).$transaction === "function") return (this.prisma as any).$transaction(work);
    return work(this.prisma as any);
  }

  private async recordAudit(tx: any, actor: Actor, action: string, entityId: string, metadata: Record<string, unknown>) {
    if (this.audit?.record) return this.audit.record(tx, { actor: actor.id, action, entity: { type: "Inspection", id: entityId, metadata: metadata as any } });
    if (typeof tx.auditEvent?.create === "function") return tx.auditEvent.create({ data: { actorId: actor.id, action, entityType: "Inspection", entityId, metadata } });
  }
}
