import { describe, expect, it } from "vitest";
import {
  getApiCorsOrigins,
  getApiPort,
  validateRuntimeEnvironment,
} from "./runtime";

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

  it("requires an explicit HTTPS-only allow-list for production credentials", () => {
    expect(() =>
      getApiCorsOrigins({
        NODE_ENV: "production",
        API_CORS_ORIGINS: "http://betna.example",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      getApiCorsOrigins({
        NODE_ENV: "production",
        API_CORS_ORIGINS: "*",
      }),
    ).toThrow(/Wildcard/);
    expect(() =>
      getApiCorsOrigins({
        NODE_ENV: "production",
        API_CORS_ORIGINS: "https://betna.example/path",
      }),
    ).toThrow(/origin/);
  });
});

describe("production runtime validation", () => {
  it("requires the secrets and service URLs needed to start safely", () => {
    expect(() =>
      validateRuntimeEnvironment({ NODE_ENV: "production" }),
    ).toThrow(/DATABASE_URL.*SESSION_SECRET.*JWT_SECRET/s);
    expect(() =>
      validateRuntimeEnvironment({
        NODE_ENV: "production",
        API_CORS_ORIGINS: "https://betna.example",
        DATABASE_URL: "postgresql://db/betna",
        REDIS_URL: "redis://redis:6379",
        SESSION_SECRET: "session-secret-that-is-long-enough",
        JWT_SECRET: "jwt-secret-that-is-long-enough",
        MEDIA_SIGNING_SECRET: "media-signing-secret-that-is-long-enough",
      }),
    ).not.toThrow();
  });
});
