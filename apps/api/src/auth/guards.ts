import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";

export const ROLES_KEY = "betna:roles";
export const TERRITORY_SCOPED_KEY = "betna:territory-scoped";

const roleMetadata = new WeakMap<object, string[]>();
const territoryMetadata = new WeakSet<object>();

export function Roles(...roles: string[]): MethodDecorator & ClassDecorator {
  return (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    const receiver = descriptor?.value ?? target;
    roleMetadata.set(
      receiver,
      roles.map((role) => role.toUpperCase()),
    );
    SetMetadata(
      ROLES_KEY,
      roles.map((role) => role.toUpperCase()),
    )(target, propertyKey!, descriptor!);
  };
}

export function TerritoryScoped(): MethodDecorator & ClassDecorator {
  return (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    const receiver = descriptor?.value ?? target;
    territoryMetadata.add(receiver);
    SetMetadata(TERRITORY_SCOPED_KEY, true)(target, propertyKey!, descriptor!);
  };
}

function metadata(context: ExecutionContext, key: string): unknown {
  const handler = context.getHandler() as object;
  const target = context.getClass() as object;
  if (key === ROLES_KEY)
    return roleMetadata.get(handler) ?? roleMetadata.get(target);
  if (key === TERRITORY_SCOPED_KEY)
    return territoryMetadata.has(handler) || territoryMetadata.has(target);
  return undefined;
}

function normalizedRoles(user: any): string[] {
  return (user?.roles ?? [])
    .map((role: any) =>
      typeof role === "string" ? role : (role?.name ?? role?.role?.name),
    )
    .filter(Boolean)
    .map((role: string) => role.toUpperCase());
}

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = metadata(context, ROLES_KEY) as string[] | undefined;
    if (!required?.length) return true;
    const roles = normalizedRoles(context.switchToHttp().getRequest().user);
    return required.some((role) => roles.includes(role.toUpperCase()));
  }
}

@Injectable()
export class TerritoryScopedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!metadata(context, TERRITORY_SCOPED_KEY)) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (normalizedRoles(user).includes("ADMIN")) return true;
    const territoryId =
      request.params?.territoryId ??
      request.body?.territoryId ??
      request.query?.territoryId ??
      request.territoryId;
    if (!territoryId) return false;
    const allowed =
      user?.territoryIds ??
      user?.territories?.map(
        (territory: any) => territory.id ?? territory.territoryId,
      ) ??
      [];
    return allowed.includes(territoryId);
  }
}

export const TerritoryGuard = TerritoryScopedGuard;
