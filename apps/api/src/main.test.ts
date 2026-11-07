import { describe, expect, it } from "vitest";
import { getApiCorsOrigins, getApiPort } from "./runtime";

describe("API port resolution", () => {
  it("uses API_PORT and the documented 4000 default", () => {
    expect(getApiPort({ API_PORT: "4400" })).toBe(4400);
    expect(getApiPort({})).toBe(4000);
  });
});

describe("API CORS policy", () => {
  it("allows the configured web origins and rejects an absent production policy", () => {
    expect(
      getApiCorsOrigins({
        API_CORS_ORIGINS: "https://betna.example,https://www.betna.example",
      }),
    ).toEqual(["https://betna.example", "https://www.betna.example"]);
    expect(() => getApiCorsOrigins({ NODE_ENV: "production" })).toThrow(
      /API_CORS_ORIGINS/,
    );
  });
});
