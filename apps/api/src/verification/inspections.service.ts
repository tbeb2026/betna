import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AssignmentsService } from "./assignments.service";
import { ChecklistAnswers, ChecklistService } from "./checklist.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

type Actor = {
  id: string;
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
  territoryIds?: string[];
};

type Submission = {
  checklist: ChecklistAnswers;
  evidence?: Array<{ mediaId: string }>;
  notes?: string;
  requestKey?: string;
};

@Injectable()
export class InspectionsService {
  private readonly syncedEvidence = new Map<string, Set<string>>();
  private readonly validatedEvidence = new Map<string, Set<string>>();
  private readonly requiredEvidence = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly checklist: ChecklistService,
    private readonly audit?: AuditService,
  ) {}

  assign(inspectionId: string, verifierId: string, actor: Actor) {
    return this.assignments.assign(inspectionId, verifierId, actor);
  }

  async createDraft(propertyId: string, territoryId?: string, cityId?: string) {
    const property = await this.prisma.property.findUnique?.({
      where: { id: propertyId },
    });
    if (!property) throw new NotFoundException("Property not found");
    return this.prisma.inspection.create({
      data: {
        propertyId,
        territoryId,
        cityId,
        status: "DRAFT",
        checklist: {},
      },
      include: { evidence: true, property: true },
    });
  }

  listForVerifier(verifierId: string, territoryIds?: string[]) {
    return this.assignments.listForVerifier(verifierId, territoryIds);
  }

  async getForVerifier(inspectionId: string, verifierId: string) {
    const inspection = await this.findInspection(inspectionId);
    await this.assertVerifierAccess(inspection, verifierId);
    return inspection;
  }

  listForAdmin() {
    return this.prisma.inspection.findMany({
      where: { status: "READY_FOR_REVIEW" },
      include: { property: true, evidence: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  getChecklist(category: string) {
    return this.checklist.getPersisted(category);
  }

  async submitPendingUpload(
    inspectionId: string,
    verifierId: string,
    input: Submission,
  ) {
    const inspection = await this.findInspection(inspectionId);
    await this.assertVerifierAccess(inspection, verifierId);
    const requestKey = input.requestKey?.trim() || undefined;
    if (
      requestKey &&
      inspection.submissionRequestKey === requestKey &&
      inspection.status !== "REJECTED"
    ) {
      return inspection;
    }
    const category = String(inspection.property?.category ?? "residential");
    const definition = await this.checklist.getPersisted(category);
    const missing = definition.required.filter(
      (key) => !this.checklist.answerRecorded(input.checklist?.[key]),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Required inspection checklist items are incomplete: ${missing.join(", ")}`,
      );
    }
    if (!input.evidence?.length) {
      throw new BadRequestException(
        "At least one inspection evidence item is required",
      );
    }
    if (!["DRAFT", "REJECTED"].includes(inspection.status)) {
      throw new ConflictException("Only draft inspections can be submitted");
    }
    await this.replaceEvidence(inspectionId, input.evidence);
    return this.prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        status: "PENDING_UPLOAD",
        checklist: input.checklist as any,
        notes: input.notes?.trim() || null,
        inspectedAt: new Date(),
        requiredEvidenceSynced: false,
        checklistVersion: definition.version,
        submissionRequestKey: requestKey,
      },
      include: { evidence: true, property: true },
    });
  }

  async markEvidenceSynced(
    inspectionId: string,
    mediaId: string,
    result: { ok?: boolean; validated?: boolean } = {},
    verifierId?: string,
  ) {
    if (result.ok === false) {
      throw new BadRequestException(
        "Evidence upload failed; synchronization retry is available",
      );
    }
    const inspection = await this.findInspection(inspectionId);
    const requiredEvidence = await this.currentEvidence(inspection);
    if (verifierId) await this.assertVerifierAccess(inspection, verifierId);
    if (
      (inspection.status === "READY_FOR_REVIEW" ||
        inspection.status === "APPROVED") &&
      inspection.requiredEvidenceSynced &&
      requiredEvidence.some((entry: any) => entry.mediaId === mediaId)
    ) {
      return inspection;
    }
    if (inspection.status !== "PENDING_UPLOAD") {
      throw new ConflictException(
        "Inspection is not waiting for evidence uploads",
      );
    }
    if (!requiredEvidence.some((entry: any) => entry.mediaId === mediaId)) {
      throw new BadRequestException(
        "Evidence item is not part of the required evidence for this inspection",
      );
    }
    if (this.prisma.media?.findUnique) {
      const media = await this.prisma.media.findUnique({
        where: { id: mediaId },
      });
      if (!media) {
        throw new NotFoundException("Evidence media not found");
      }
      if (
        media.purpose !== "INSPECTION_EVIDENCE" ||
        media.status !== "CLEAN" ||
        (media.propertyId && media.propertyId !== inspection.propertyId)
      ) {
        throw new BadRequestException(
          "Evidence must be a clean inspection upload",
        );
      }
    }
    const synced = this.syncedEvidence.get(inspectionId) ?? new Set<string>();
    synced.add(mediaId);
    this.syncedEvidence.set(inspectionId, synced);
    const validated =
      this.validatedEvidence.get(inspectionId) ?? new Set<string>();
    if (result.validated !== false) validated.add(mediaId);
    else validated.delete(mediaId);
    this.validatedEvidence.set(inspectionId, validated);
    if (this.prisma.inspectionEvidence?.upsert) {
      await this.prisma.inspectionEvidence.upsert({
        where: { inspectionId_mediaId: { inspectionId, mediaId } },
        create: {
          inspectionId,
          mediaId,
          syncedAt: new Date(),
          validatedAt: result.validated === false ? null : new Date(),
        },
        update: {
          syncedAt: new Date(),
          validatedAt: result.validated === false ? null : new Date(),
        },
      });
    }
    const requiredEntries = requiredEvidence.filter((entry: any) => entry.mediaId);
    const allSynced =
      requiredEntries.length > 0 &&
      requiredEntries.every(
        (entry: any) =>
          (synced.has(entry.mediaId) || Boolean(entry.syncedAt)) &&
          (validated.has(entry.mediaId) || Boolean(entry.validatedAt)),
      );
    if (!allSynced) {
      return this.prisma.inspection.update({
        where: { id: inspectionId },
        data: { requiredEvidenceSynced: false },
        include: { evidence: true, property: true },
      });
    }
    return this.prisma.inspection.update({
      where: { id: inspectionId },
      data: { status: "READY_FOR_REVIEW", requiredEvidenceSynced: true },
      include: { evidence: true, property: true },
    });
  }

  async adminReview(
    inspectionId: string,
    actor: Actor,
    decision: "APPROVED" | "REJECTED",
    notes?: string,
  ) {
    if (!this.roles(actor).includes("ADMIN")) {
      throw new ForbiddenException("Admin access is required");
    }
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      throw new BadRequestException(
        "Review decision must be APPROVED or REJECTED",
      );
    }
    const inspection = await this.findInspection(inspectionId);
    const definition = await this.checklist.getPersisted(
      String(inspection.property?.category ?? "residential"),
    );
    const answers = (inspection.checklist ?? {}) as Record<string, unknown>;
    const missingChecklistItems = definition.required.filter(
      (key) => !this.checklist.answerPasses(answers[key]),
    );
    if (
      decision === "APPROVED" &&
      (inspection.status !== "READY_FOR_REVIEW" ||
        !inspection.requiredEvidenceSynced ||
        missingChecklistItems.length > 0)
    ) {
      const checklistMessage = missingChecklistItems.length
        ? `: ${missingChecklistItems.join(", ")}`
        : "";
      throw new ConflictException(
        `Only synced, validated reports are ready for approval${checklistMessage}`,
      );
    }
    if (inspection.status !== "READY_FOR_REVIEW") {
      throw new ConflictException(
        "Only reports ready for review can be approved or rejected",
      );
    }
    return this.withTransaction(async (tx: any) => {
      const updated = await tx.inspection.update({
        where: { id: inspectionId },
        data: { status: decision, notes: notes?.trim() || inspection.notes },
        include: { evidence: true, property: true },
      });
      if (decision === "APPROVED" && tx.property?.update) {
        const inspectedAt = inspection.inspectedAt ?? new Date();
        await tx.property.update({
          where: { id: inspection.propertyId },
          data: {
            status: "VERIFIED",
            lastInspectedAt: inspectedAt,
            verificationValidUntil: new Date(
              inspectedAt.getTime() + 365 * 24 * 60 * 60 * 1000,
            ),
          },
        });
      }
      await this.recordAudit(tx, actor, `INSPECTION_${decision}`, inspectionId, {
        propertyId: inspection.propertyId,
        checklistVersion: inspection.checklistVersion,
      });
      return updated;
    });
  }

  private async findInspection(id: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: { evidence: true, property: true },
    });
    if (!inspection) throw new NotFoundException("Inspection not found");
    return inspection;
  }

  private async assertVerifierAccess(inspection: any, verifierId: string) {
    if (inspection.verifierId !== verifierId) {
      throw new ForbiddenException(
        "Inspection is not assigned to this verifier",
      );
    }
    const verifier = await this.prisma.user.findUnique({
      where: { id: verifierId },
      include: {
        territoryAssignments: true,
        roles: { include: { role: true } },
      },
    });
    if (!verifier || !this.roles(verifier).includes("VERIFIER")) {
      throw new ForbiddenException("Verifier access is required");
    }
    this.assignments.assertVerifierTerritory(verifier, inspection.territoryId);
  }

  private async replaceEvidence(
    inspectionId: string,
    evidence: Array<{ mediaId: string }>,
  ) {
    this.syncedEvidence.delete(inspectionId);
    this.validatedEvidence.delete(inspectionId);
    this.requiredEvidence.set(
      inspectionId,
      evidence.map(({ mediaId }) => mediaId),
    );
    if (
      this.prisma.inspectionEvidence?.deleteMany &&
      this.prisma.inspectionEvidence?.createMany
    ) {
      await this.prisma.inspectionEvidence.deleteMany({
        where: { inspectionId },
      });
      await this.prisma.inspectionEvidence.createMany({
        data: evidence.map(({ mediaId }) => ({ inspectionId, mediaId })),
      });
    }
  }

  private async currentEvidence(inspection: any) {
    if (this.prisma.inspectionEvidence?.findMany) {
      return this.prisma.inspectionEvidence.findMany({
        where: { inspectionId: inspection.id },
      });
    }
    const required = this.requiredEvidence.get(inspection.id);
    return (
      required?.map((mediaId) => ({ mediaId })) ?? inspection.evidence ?? []
    );
  }

  private roles(actor: any): string[] {
    return (actor?.roles ?? [])
      .map((entry: any) =>
        typeof entry === "string" ? entry : (entry?.name ?? entry?.role?.name),
      )
      .filter(Boolean)
      .map((role: string) => role.toUpperCase());
  }

  private async withTransaction<T>(work: (tx: any) => Promise<T>) {
    if (typeof (this.prisma as any).$transaction === "function") {
      return (this.prisma as any).$transaction(work);
    }
    return work(this.prisma as any);
  }

  private async recordAudit(
    tx: any,
    actor: Actor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    if (typeof tx.auditEvent?.create === "function") {
      await tx.auditEvent.create({
        data: { actorId: actor.id, action, entityType: "Inspection", entityId, metadata },
      });
    } else {
      await this.audit?.record(actor.id, action, {
        type: "Inspection",
        id: entityId,
        metadata: metadata as any,
      });
    }
  }
}

export { InspectionsService as InspectionService };
