import { Injectable } from "@nestjs/common";

export interface AuditEntity {
  type?: string;
  entityType?: string;
  id?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: any) {}

  /**
   * Audit is append-only by API contract. The database trigger installed by
   * Task 2 rejects UPDATE/DELETE/TRUNCATE, so callers receive no mutation API.
   */
  async record(
    actor: string | { id?: string; userId?: string } | null | undefined,
    action: string,
    entity: AuditEntity | string,
  ) {
    const normalizedEntity =
      typeof entity === "string" ? { id: entity } : entity;
    const entityType = normalizedEntity.type ?? normalizedEntity.entityType;
    const entityId = normalizedEntity.id ?? normalizedEntity.entityId;
    if (!entityType || !entityId)
      throw new Error("Audit entity type and id are required");
    return this.prisma.auditEvent.create({
      data: {
        actorId:
          typeof actor === "string"
            ? actor
            : (actor?.id ?? actor?.userId ?? null),
        action,
        entityType,
        entityId,
        metadata: normalizedEntity.metadata ?? {},
      },
    });
  }
}
