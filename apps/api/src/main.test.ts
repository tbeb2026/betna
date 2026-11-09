import { describe, expect, it } from "vitest";
import {
  API_CORS_METHODS,
  getApiCorsOrigins,
  getApiPort,
  getPublicApiOrigin,
  validateRuntimeEnvironment,
} from "./runtime";

describe("API port resolution", () => {
  it("uses API_PORT and the documented 4000 default", () => {
    expect(getApiPort({ API_PORT: "4400" })).toBe(4400);
    expect(getApiPort({})).toBe(4000);
  });
});

describe("API CORS policy", () => {
  it("allows browser clients to submit PATCH requests", () => {
    expect(API_CORS_METHODS).toContain("PATCH");
  });

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
        PUBLIC_API_URL: "https://api.betna.example",
        DATABASE_URL: "postgresql://db/betna",
        REDIS_URL: "redis://redis:6379",
        SESSION_SECRET: "session-secret-that-is-long-enough",
        JWT_SECRET: "jwt-secret-that-is-long-enough",
        MEDIA_SIGNING_SECRET: "media-signing-secret-that-is-long-enough",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "Betna <noreply@example.com>",
        RESEND_API_KEY: "re_test",
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "wa-token",
        WHATSAPP_PHONE_NUMBER_ID: "phone-id",
        S3_ENDPOINT: "https://s3.example.com",
        S3_REGION: "af-south-1",
        S3_ACCESS_KEY_ID: "access",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_PUBLIC_BUCKET: "public",
        S3_PRIVATE_BUCKET: "private",
        MEDIA_STORAGE_PROVIDER: "s3",
      }),
    ).not.toThrow();
  });

  it("rejects production no-op notification and storage configuration", () => {
    expect(() => validateRuntimeEnvironment({
      NODE_ENV: "production",
      API_CORS_ORIGINS: "https://betna.example",
      PUBLIC_API_URL: "https://api.betna.example",
      DATABASE_URL: "postgresql://db/betna",
      REDIS_URL: "redis://redis:6379",
      SESSION_SECRET: "session-secret-that-is-long-enough",
      JWT_SECRET: "jwt-secret-that-is-long-enough",
      MEDIA_SIGNING_SECRET: "media-signing-secret-that-is-long-enough",
      EMAIL_PROVIDER: "log",
      EMAIL_FROM: "noreply@example.com",
      WHATSAPP_PROVIDER: "log",
      S3_ENDPOINT: "https://s3.example.com",
      S3_REGION: "af-south-1",
      S3_ACCESS_KEY_ID: "access",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_PUBLIC_BUCKET: "public",
      S3_PRIVATE_BUCKET: "private",
      MEDIA_STORAGE_PROVIDER: "fake",
    })).toThrow(/EMAIL_PROVIDER/);
  });

  it("requires a configured HTTPS public API origin", () => {
    expect(getPublicApiOrigin({ NODE_ENV: "development" })).toBe(
      "http://localhost:4000",
    );
    expect(() => getPublicApiOrigin({ NODE_ENV: "production" })).toThrow(
      /PUBLIC_API_URL/,
    );
    expect(() => getPublicApiOrigin({ NODE_ENV: "staging" })).toThrow(
      /PUBLIC_API_URL/,
    );
    expect(() => getPublicApiOrigin({ NODE_ENV: "test" })).toThrow(
      /PUBLIC_API_URL/,
    );
    expect(() => getPublicApiOrigin({})).toThrow(/PUBLIC_API_URL/);
    expect(() =>
      getPublicApiOrigin({
        NODE_ENV: "production",
        PUBLIC_API_URL: "http://localhost:4000",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      getPublicApiOrigin({
        NODE_ENV: "staging",
        PUBLIC_API_URL: "https://localhost:4000",
      }),
    ).toThrow(/localhost|loopback/);
    expect(() =>
      getPublicApiOrigin({
        NODE_ENV: "production",
        PUBLIC_API_URL: "https://localhost:4000",
      }),
    ).toThrow(/localhost|loopback/);
    expect(() =>
      getPublicApiOrigin({
        NODE_ENV: "production",
        PUBLIC_API_URL: "https://127.0.0.1:4000",
      }),
    ).toThrow(/localhost|loopback/);
    expect(() =>
      getPublicApiOrigin({
        NODE_ENV: "production",
        PUBLIC_API_URL: "https://[::1]:4000",
      }),
    ).toThrow(/localhost|loopback/);
    expect(
      getPublicApiOrigin({
        NODE_ENV: "staging",
        PUBLIC_API_URL: "https://api.betna.example/",
      }),
    ).toBe("https://api.betna.example");
  });
});
