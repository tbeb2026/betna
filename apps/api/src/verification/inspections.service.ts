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

type Actor = {
  id: string;
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
  territoryIds?: string[];
};

type Submission = {
  checklist: ChecklistAnswers;
  evidence?: Array<{ mediaId: string }>;
  notes?: string;
};

@Injectable()
export class InspectionsService {
  private readonly syncedEvidence = new Map<string, Set<string>>();
  private readonly validatedEvidence = new Map<string, Set<string>>();
  private readonly requiredEvidence = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments = new AssignmentsService(prisma),
    private readonly checklist = new ChecklistService(),
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

  getChecklist(category: string) {
    return this.checklist.get(category);
  }

  async submitPendingUpload(
    inspectionId: string,
    verifierId: string,
    input: Submission,
  ) {
    const inspection = await this.findInspection(inspectionId);
    await this.assertVerifierAccess(inspection, verifierId);
    const category = String(inspection.property?.category ?? "residential");
    this.checklist.assertComplete(category, input.checklist);
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
      },
      include: { evidence: true, property: true },
    });
  }

  async markEvidenceSynced(
    inspectionId: string,
    mediaId: string,
    result: { ok?: boolean; validated?: boolean } = {},
  ) {
    if (result.ok === false) {
      throw new BadRequestException(
        "Evidence upload failed; synchronization retry is available",
      );
    }
    const inspection = await this.findInspection(inspectionId);
    if (inspection.status !== "PENDING_UPLOAD") {
      throw new ConflictException(
        "Inspection is not waiting for evidence uploads",
      );
    }
    if (this.prisma.media?.findUnique) {
      const media = await this.prisma.media.findUnique({
        where: { id: mediaId },
      });
      if (
        media &&
        (media.purpose !== "INSPECTION_EVIDENCE" || media.status !== "CLEAN")
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
    const evidence = await this.currentEvidence(inspection);
    const requiredEntries = evidence.filter((entry: any) => entry.mediaId);
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
    const inspection = await this.findInspection(inspectionId);
    if (
      decision === "APPROVED" &&
      (inspection.status !== "READY_FOR_REVIEW" ||
        !inspection.requiredEvidenceSynced)
    ) {
      throw new ConflictException(
        "Only synced, validated reports are ready for approval",
      );
    }
    const updated = await this.prisma.inspection.update({
      where: { id: inspectionId },
      data: { status: decision, notes: notes?.trim() || inspection.notes },
      include: { evidence: true, property: true },
    });
    if (decision === "APPROVED" && this.prisma.property?.update) {
      const inspectedAt = inspection.inspectedAt ?? new Date();
      await this.prisma.property.update({
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
    return updated;
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
}

export { InspectionsService as InspectionService };
