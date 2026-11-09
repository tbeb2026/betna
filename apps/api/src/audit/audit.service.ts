import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

export interface AuditEntity {
  type?: string;
  entityType?: string;
  id?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditRecord {
  actor?: string | { id?: string; userId?: string } | null;
  actorId?: string | null;
  action: string;
  entity?: AuditEntity | string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Audit is append-only by API contract. The database trigger installed by
   * Task 2 rejects UPDATE/DELETE/TRUNCATE, so callers receive no mutation API.
   */
  /**
   * Record an immutable event using either the service client or an active
   * transaction client. The transaction form is deliberately explicit:
   * `record(tx, event)` keeps the audit insert in the same commit boundary as
   * the state mutation it describes.
   */
  async record(
    actor: string | { id?: string; userId?: string } | null | undefined,
    action: string,
    entity: AuditEntity | string,
    tx?: { auditEvent?: { create: (args: any) => Promise<unknown> } },
  ): Promise<unknown>;
  async record(
    tx: { auditEvent?: { create: (args: any) => Promise<unknown> } },
    event: AuditRecord,
  ): Promise<unknown>;
  async record(
    actorOrTx:
      | string
      | { id?: string; userId?: string }
      | { auditEvent?: { create: (args: any) => Promise<unknown> } }
      | null
      | undefined,
    actionOrEvent: string | AuditRecord,
    entity?: AuditEntity | string,
    tx?: { auditEvent?: { create: (args: any) => Promise<unknown> } },
  ) {
    const transaction =
      typeof actionOrEvent === "object"
        ? (actorOrTx as { auditEvent?: { create: (args: any) => Promise<unknown> } })
        : tx;
    const event: AuditRecord =
      typeof actionOrEvent === "object"
        ? actionOrEvent
        : { actor: actorOrTx as any, action: actionOrEvent, entity };
    const normalizedEntity = event.entity
      ? typeof event.entity === "string"
        ? { id: event.entity }
        : event.entity
      : { type: event.entityType, id: event.entityId, metadata: event.metadata };
    const entityType = normalizedEntity.type ?? normalizedEntity.entityType;
    const entityId = normalizedEntity.id ?? normalizedEntity.entityId;
    if (!entityType || !entityId)
      throw new Error("Audit entity type and id are required");
    const actor = event.actor;
    const create = transaction?.auditEvent?.create ?? this.prisma.auditEvent.create.bind(this.prisma.auditEvent);
    return create({
      data: {
        actorId: event.actorId ??
          (typeof actor === "string"
            ? actor
            : (actor?.id ?? actor?.userId ?? null)),
        action: event.action,
        entityType,
        entityId,
        metadata: normalizedEntity.metadata ?? event.metadata ?? {},
      },
    });
  }
}
