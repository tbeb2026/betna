import { describe, expect, it } from "vitest";
import { RolesGuard, Roles } from "../src/auth/guards";

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
});
