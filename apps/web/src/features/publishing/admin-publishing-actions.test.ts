import { describe, expect, it } from "vitest";
import { canPublishListing, publishingPath } from "./admin-publishing-actions";

describe("admin publishing action", () => {
  it("offers publication only for verified listings", () => {
    expect(canPublishListing("VERIFIED")).toBe(true);
    expect(canPublishListing("PUBLISHED")).toBe(false);
    expect(canPublishListing("PENDING_REVIEW")).toBe(false);
  });

  it("builds an encoded BFF publish path", () => {
    expect(publishingPath("property/with spaces")).toBe(
      "/admin/publishing/property%2Fwith%20spaces/publish",
    );
  });
});
