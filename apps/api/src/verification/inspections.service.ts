import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AssignmentsService } from "./assignments.service";
import { ChecklistAnswers, ChecklistService } from "./checklist.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notifications.service";

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
    private readonly notifications?: NotificationService,
  ) {}

  assign(inspectionId: string, verifierId: string, actor: Actor) {
    return this.assignments.assign(inspectionId, verifierId, actor);
  }

  async createDraft(propertyId: string, territoryId?: string, cityId?: string) {
    const property = await this.prisma.property.findUnique?.({
      where: { id: propertyId },
      include: { city: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    return this.prisma.inspection.create({
      data: {
        propertyId,
        territoryId: territoryId ?? property.city?.territoryId,
        cityId: cityId ?? property.cityId,
        status: "DRAFT",
        checklist: {},
      },
      include: { evidence: true, property: true },
    });
  }

  /** Create the unassigned inspection used after an ownership change. */
  async createDraftForOwnershipReverification(
    propertyId: string,
    db: any = this.prisma,
  ) {
    const property = await db.property.findUnique({
      where: { id: propertyId },
      include: { city: true },
    });
    if (!property) throw new NotFoundException("Property not found");

    const existing = typeof db.inspection?.findFirst === "function"
      ? await db.inspection.findFirst({
          where: {
            propertyId,
            status: "DRAFT",
            verifierId: null,
            ownerSubmissionKey: null,
          },
          orderBy: { createdAt: "desc" },
          include: { evidence: true, property: true },
        })
      : null;
    if (existing) return existing;

    return db.inspection.create({
      data: {
        propertyId,
        territoryId: property.city?.territoryId ?? null,
        cityId: property.cityId,
        status: "DRAFT",
        checklist: {},
      },
      include: { evidence: true, property: true },
    });
  }

  /**
   * Create the first inspection for a normal owner submission. The stable
   * request key makes retries and concurrent submissions converge on the same
   * row while the city relation supplies the verifier territory scope.
   */
  async createDraftForSubmission(propertyId: string, db: any = this.prisma) {
    const property = await db.property.findUnique({
      where: { id: propertyId },
      include: { city: true },
    });
    if (!property) throw new NotFoundException("Property not found");

    const ownerSubmissionKey = `owner-submit:${propertyId}`;
    const data = {
      propertyId,
      territoryId: property.city?.territoryId ?? null,
      cityId: property.cityId,
      status: "DRAFT" as const,
      checklist: {},
      ownerSubmissionKey,
    };

    if (typeof db.inspection.upsert === "function") {
      try {
        return await db.inspection.upsert({
          where: { ownerSubmissionKey },
          create: data,
          update: {},
          include: { evidence: true, property: true },
        });
      } catch (error) {
        // A concurrent transaction may win the unique owner-key insert. Read
        // back only that property's row; never turn a foreign row into a
        // successful owner submission.
        if ((error as { code?: string })?.code !== "P2002") throw error;
        const existing = await db.inspection.findFirst?.({
          where: { propertyId, ownerSubmissionKey },
          include: { evidence: true, property: true },
        });
        if (existing) return existing;
        throw error;
      }
    }

    const existing = typeof db.inspection.findFirst === "function"
      ? await db.inspection.findFirst({
          where: { propertyId, ownerSubmissionKey },
          include: { evidence: true, property: true },
        })
      : typeof db.inspection.findUnique === "function"
        ? await db.inspection.findUnique({
            where: { ownerSubmissionKey },
            include: { evidence: true, property: true },
          })
        : null;
    if (existing?.propertyId === propertyId) return existing;
    return db.inspection.create({
      data,
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
      where: { status: { in: ["DRAFT", "READY_FOR_REVIEW"] } },
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
    const reportRequestKey = input.requestKey?.trim() || undefined;
    if (
      reportRequestKey &&
      inspection.reportRequestKey === reportRequestKey &&
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
    const submitted = await this.prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        status: "PENDING_UPLOAD",
        checklist: input.checklist as any,
        notes: input.notes?.trim() || null,
        inspectedAt: new Date(),
        requiredEvidenceSynced: false,
        checklistVersion: definition.version,
        reportRequestKey,
      },
      include: { evidence: true, property: true },
    });
    if (this.notifications) {
      const recipients = await this.notificationRecipients({
        ownerId: submitted.property?.ownerId,
        roles: ["ADMIN"],
      });
      await this.notifications.enqueue({
        type: "INSPECTION_SUBMITTED",
        messageKey: "verification.submitted",
        idempotencyKey: `inspection-submitted:${inspectionId}:${reportRequestKey ?? submitted.updatedAt?.toISOString() ?? "latest"}`,
        recipients,
        payload: { inspectionId, propertyId: submitted.propertyId, status: submitted.status },
        channels: ["IN_APP", "EMAIL", "WHATSAPP"],
      });
    }
    return submitted;
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
    if (typeof this.prisma.media?.findUnique !== "function") {
      throw new InternalServerErrorException(
        "Evidence media persistence is not configured",
      );
    }
    if (typeof this.prisma.inspectionEvidence?.upsert !== "function") {
      throw new InternalServerErrorException(
        "Inspection evidence persistence is not configured",
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
    await this.assertEvidenceMediaOwnership(inspectionId, [mediaId]);
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
    const synced = this.syncedEvidence.get(inspectionId) ?? new Set<string>();
    synced.add(mediaId);
    this.syncedEvidence.set(inspectionId, synced);
    const validated =
      this.validatedEvidence.get(inspectionId) ?? new Set<string>();
    if (result.validated !== false) validated.add(mediaId);
    else validated.delete(mediaId);
    this.validatedEvidence.set(inspectionId, validated);
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
    const reviewed = await this.withTransaction(async (tx: any) => {
      const hint = await this.findInspection(inspectionId, tx);
      await this.lockInspection(tx, inspectionId);
      await this.lockProperty(tx, hint.propertyId);
      const inspection = await this.findInspection(inspectionId, tx);
      const definition = await this.checklist.getPersisted(
        String(inspection.property?.category ?? "residential"),
        inspection.checklistVersion,
      );
      const answers = (inspection.checklist ?? {}) as Record<string, unknown>;
      const missingChecklistItems = definition.required.filter(
        (key) => !this.checklist.answerPasses(answers[key]),
      );
      if (
        decision === "APPROVED" &&
        (!inspection.requiredEvidenceSynced || missingChecklistItems.length > 0)
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

      const transitionData = {
        status: decision,
        notes: notes?.trim() || inspection.notes,
        ...(decision === "REJECTED" ? { ownerSubmissionKey: null } : {}),
      };
      const transition = typeof tx.inspection.updateMany === "function"
        ? await tx.inspection.updateMany({
            where: { id: inspectionId, status: "READY_FOR_REVIEW" },
            data: transitionData,
          })
        : null;
      if (transition && transition.count !== 1) {
        throw new ConflictException("Inspection has already been reviewed");
      }
      if (!transition) {
        await tx.inspection.update({
          where: { id: inspectionId },
          data: transitionData,
        });
      }

      if (decision === "APPROVED" && tx.property) {
        const inspectedAt = inspection.inspectedAt ?? new Date();
        const propertyTransition = typeof tx.property.updateMany === "function"
          ? await tx.property.updateMany({
              where: {
                id: inspection.propertyId,
                // New submissions are PENDING_REVIEW; ownership re-verification
                // explicitly uses PENDING_INSPECTION. Both are valid review
                // lifecycles, while an already terminal/fraud state is not.
                status: { in: ["PENDING_REVIEW", "PENDING_INSPECTION"] },
              },
              data: {
                status: "VERIFIED",
                lastInspectedAt: inspectedAt,
                verificationValidUntil: new Date(
                  inspectedAt.getTime() + 365 * 24 * 60 * 60 * 1000,
                ),
              },
            })
          : null;
        if (propertyTransition && propertyTransition.count !== 1) {
          throw new ConflictException("Property is no longer awaiting this inspection");
        }
        if (!propertyTransition && tx.property.update) {
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
      } else if (decision === "REJECTED" && tx.property) {
        const propertyTransition = typeof tx.property.updateMany === "function"
          ? await tx.property.updateMany({
              where: {
                id: inspection.propertyId,
                status: { in: ["PENDING_REVIEW", "PENDING_INSPECTION"] },
              },
              data: { status: "DRAFT" },
            })
          : null;
        if (propertyTransition && propertyTransition.count !== 1) {
          throw new ConflictException("Property is no longer awaiting this inspection");
        }
        if (!propertyTransition && tx.property.update) {
          await tx.property.update({
            where: { id: inspection.propertyId },
            data: { status: "DRAFT" },
          });
        }
        await this.recordAudit(tx, actor, "PROPERTY_REVIEW_REOPENED", inspection.propertyId, {
          inspectionId,
          previousStatus: inspection.property?.status ?? "PENDING_REVIEW",
          status: "DRAFT",
        });
      }
      await this.recordAudit(tx, actor, `INSPECTION_${decision}`, inspectionId, {
        propertyId: inspection.propertyId,
        checklistVersion: inspection.checklistVersion,
      });
      return this.findInspection(inspectionId, tx);
    });
    if (this.notifications) {
      const recipients = await this.notificationRecipients({
        ownerId: reviewed.property?.ownerId,
        verifierId: reviewed.verifierId,
      });
      await this.notifications.enqueue({
        type: `INSPECTION_${decision}`,
        messageKey: decision === "APPROVED" ? "verification.approved" : "verification.rejected",
        idempotencyKey: `inspection-review:${inspectionId}:${decision}:${reviewed.updatedAt?.toISOString() ?? "latest"}`,
        recipients,
        payload: {
          inspectionId,
          propertyId: reviewed.propertyId,
          status: reviewed.status,
          propertyStatus: reviewed.property?.status,
        },
        channels: ["IN_APP", "EMAIL", "WHATSAPP"],
      });
    }
    return reviewed;
  }

  private async findInspection(id: string, db: any = this.prisma) {
    const inspection = await db.inspection.findUnique({
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
    if (typeof this.prisma.user?.findUnique !== "function") {
      throw new ForbiddenException("Verifier authorization is unavailable");
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
    const mediaIds = evidence.map(({ mediaId }) => mediaId);
    const evidenceStore: any = this.prisma.inspectionEvidence;
    if (
      typeof evidenceStore?.deleteMany === "function" &&
      typeof evidenceStore?.createMany === "function"
    ) {
      await this.withTransaction(async (tx: any) => {
        await this.assertEvidenceMediaOwnership(inspectionId, mediaIds, tx);
        await tx.inspectionEvidence.deleteMany({
          where: { inspectionId },
        });
        await tx.inspectionEvidence.createMany({
          data: evidence.map(({ mediaId }) => ({ inspectionId, mediaId })),
        });
      });
    } else {
      await this.assertEvidenceMediaOwnership(inspectionId, mediaIds);
    }
    this.syncedEvidence.delete(inspectionId);
    this.validatedEvidence.delete(inspectionId);
    this.requiredEvidence.set(inspectionId, mediaIds);
  }

  private async assertEvidenceMediaOwnership(
    inspectionId: string,
    mediaIds: string[],
    tx: any = this.prisma,
  ) {
    const uniqueMediaIds = [...new Set(mediaIds.filter(Boolean))];
    if (!uniqueMediaIds.length) return;
    if (typeof tx.inspectionEvidence?.findMany !== "function") {
      throw new ForbiddenException("Inspection evidence linkage is unavailable");
    }
    const links = await tx.inspectionEvidence.findMany({
      where: { mediaId: { in: uniqueMediaIds } },
      select: { inspectionId: true, mediaId: true },
    });
    if (
      links.some(
        (link: any) =>
          link.inspectionId !== inspectionId &&
          uniqueMediaIds.includes(link.mediaId),
      )
    ) {
      throw new ForbiddenException(
        "Evidence media is already linked to another inspection",
      );
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

  private async notificationRecipients(input: { ownerId?: string | null; verifierId?: string | null; roles?: string[] }) {
    const rows: any[] = [];
    if (typeof (this.prisma as any).user?.findMany === "function" && input.roles?.length) {
      rows.push(...(await (this.prisma as any).user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { name: { in: input.roles } } } } }, select: { id: true, email: true, phone: true, preferredLocale: true } })));
    }
    for (const id of [input.ownerId, input.verifierId]) {
      if (!id || typeof (this.prisma as any).user?.findUnique !== "function") continue;
      const row = await (this.prisma as any).user.findUnique({ where: { id }, select: { id: true, email: true, phone: true, preferredLocale: true } });
      if (row && !rows.some((candidate) => candidate.id === row.id)) rows.push(row);
    }
    return rows.map((row) => ({ userId: row.id, email: row.email, phone: row.phone, locale: row.preferredLocale ?? "en" }));
  }

  private async withTransaction<T>(work: (tx: any) => Promise<T>) {
    if (typeof (this.prisma as any).$transaction === "function") {
      return (this.prisma as any).$transaction(work);
    }
    return work(this.prisma as any);
  }

  private async lockInspection(tx: any, inspectionId: string) {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inspection" WHERE "id" = ${inspectionId} FOR UPDATE`);
    }
  }

  private async lockProperty(tx: any, propertyId: string) {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`);
    }
  }

  private async recordAudit(
    tx: any,
    actor: Actor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    if (this.audit?.record) {
      await this.audit.record(tx, {
        actor: actor.id,
        action,
        entity: { type: "Inspection", id: entityId, metadata: metadata as any },
      });
      return;
    }
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
