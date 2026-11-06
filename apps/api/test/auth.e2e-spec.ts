import { describe, expect, it } from "vitest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthSessionGuard, RolesGuard, Roles } from "../src/auth/guards";

describe("authorization boundary", () => {
  it("denies an owner from admin routes", () => {
    const handler = () => undefined;
    Roles("ADMIN")(handler, "admin");
    const guard = new RolesGuard();

    expect(
      guard.canActivate({
        getHandler: () => handler,
        getClass: () => class AdminController {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles: ["OWNER"] } }),
        }),
      } as never),
    ).toBe(false);
  });

  it("requires the current bearer session to revoke itself", async () => {
    const validateSession = async (token: string) => ({
      id: "session-current",
      token,
      userId: "user-1",
      roles: ["OWNER"],
      territoryIds: [],
      expiresAt: new Date(Date.now() + 60_000),
    });
    const guard = new AuthSessionGuard({ validateSession } as never);
    const request = { headers: {}, session: undefined, user: undefined };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).rejects.toMatchObject({ status: 401 });

    request.headers = { authorization: "Bearer current-token" };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).resolves.toBe(true);
    expect(request.session).toMatchObject({ id: "session-current" });

    const revoked: string[] = [];
    const controller = new AuthController({
      revokeSession: async (id: string) => void revoked.push(id),
    } as never);
    await controller.revokeSession(request as never);
    expect(revoked).toEqual(["session-current"]);
  });
});
