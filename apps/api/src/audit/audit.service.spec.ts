import { describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  it("inserts through the supplied transaction client", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const service = new AuditService({ auditEvent: { create: vi.fn() } } as any);

    await service.record(
      { auditEvent: { create: txCreate } },
      {
        actor: { id: "owner-1" },
        action: "INQUIRY_OWNER_DECLINED",
        entity: { type: "Inquiry", id: "inquiry-1" },
      },
    );

    expect(txCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "owner-1",
        action: "INQUIRY_OWNER_DECLINED",
        entityType: "Inquiry",
        entityId: "inquiry-1",
      }),
    });
  });
});
