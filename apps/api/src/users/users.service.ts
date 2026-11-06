import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface UserAccessContext {
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
  territoryIds?: string[];
  territories?: Array<{ id?: string; territoryId?: string }>;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        territoryAssignments: { select: { territoryId: true } },
      },
    });
  }

  async assignTerritory(userId: string, territoryId: string): Promise<void> {
    await this.prisma.userTerritory.upsert({
      where: { userId_territoryId: { userId, territoryId } },
      update: {},
      create: { userId, territoryId },
    });
  }

  hasRole(user: UserAccessContext, role: string): boolean {
    const expected = role.toUpperCase();
    return (user?.roles ?? []).some(
      (entry) =>
        (typeof entry === "string"
          ? entry
          : (entry?.name ?? entry?.role?.name)
        )?.toUpperCase() === expected,
    );
  }

  canAccessTerritory(user: UserAccessContext, territoryId: string): boolean {
    return (
      this.hasRole(user, "ADMIN") ||
      (
        user?.territoryIds ??
        user?.territories?.map((entry) => entry.id ?? entry.territoryId) ??
        []
      ).includes(territoryId)
    );
  }
}
