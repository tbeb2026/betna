import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: any) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
  }

  hasRole(user: any, role: string): boolean {
    const expected = role.toUpperCase();
    return (user?.roles ?? []).some(
      (entry: any) =>
        (typeof entry === "string"
          ? entry
          : (entry?.name ?? entry?.role?.name)
        )?.toUpperCase() === expected,
    );
  }

  canAccessTerritory(user: any, territoryId: string): boolean {
    return (
      this.hasRole(user, "ADMIN") ||
      (
        user?.territoryIds ??
        user?.territories?.map((entry: any) => entry.id ?? entry.territoryId) ??
        []
      ).includes(territoryId)
    );
  }
}
