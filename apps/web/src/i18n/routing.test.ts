import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  getDocumentDirection,
  getRoleRedirectPath,
  resolveLocalePath,
  supportedLocales,
} from "./routing";

describe("localized routing", () => {
  it("resolves English and Tigrinya paths to supported locales", () => {
    expect(supportedLocales).toEqual(["en", "ti"]);
    expect(defaultLocale).toBe("en");
    expect(resolveLocalePath("/en")).toEqual({ locale: "en", pathname: "/" });
    expect(resolveLocalePath("/ti/owner")).toEqual({
      locale: "ti",
      pathname: "/owner",
    });
    expect(resolveLocalePath("/owner")).toEqual({
      locale: "en",
      pathname: "/owner",
    });
  });

  it("keeps both supported locales left-to-right", () => {
    expect(getDocumentDirection("en")).toBe("ltr");
    expect(getDocumentDirection("ti")).toBe("ltr");
  });

  it("sends an authenticated owner back to their portal from admin", () => {
    expect(getRoleRedirectPath("OWNER", "admin", "ti")).toBe("/ti/owner");
  });
});
