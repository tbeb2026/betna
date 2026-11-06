import { describe, expect, it } from "vitest";
import { getApiBaseUrl } from "./api-client";

describe("API URL resolution", () => {
  it("defaults to the documented local API port", () => {
    expect(getApiBaseUrl({})).toBe("http://localhost:4000");
  });

  it("uses the explicit server URL when configured", () => {
    expect(
      getApiBaseUrl({ API_INTERNAL_URL: "http://localhost:4400" }),
    ).toBe("http://localhost:4400");
  });
});
