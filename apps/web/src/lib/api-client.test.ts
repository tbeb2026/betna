import { describe, expect, it } from "vitest";
import { ApiClient, getApiBaseUrl } from "./api-client";

describe("API URL resolution", () => {
  it("defaults to the documented local API port", () => {
    expect(getApiBaseUrl({})).toBe("http://localhost:4000");
  });

  it("uses the explicit server URL when configured", () => {
    expect(getApiBaseUrl({ API_INTERNAL_URL: "http://localhost:4400" })).toBe(
      "http://localhost:4400",
    );
  });

  it("applies production URL validation when created without an explicit base URL", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousPublicUrl = process.env.NEXT_PUBLIC_API_URL;
    mutableEnv.NODE_ENV = "production";
    delete mutableEnv.NEXT_PUBLIC_API_URL;
    try {
      expect(() => new ApiClient()).toThrow(/NEXT_PUBLIC_API_URL/);
    } finally {
      if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = previousNodeEnv;
      if (previousPublicUrl === undefined)
        delete mutableEnv.NEXT_PUBLIC_API_URL;
      else mutableEnv.NEXT_PUBLIC_API_URL = previousPublicUrl;
    }
  });

  it("requires an explicit HTTPS public API URL in production", () => {
    expect(() => getApiBaseUrl({ NODE_ENV: "production" })).toThrow(
      /NEXT_PUBLIC_API_URL/,
    );
    expect(() =>
      getApiBaseUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "http://api.example.com",
      }),
    ).toThrow(/HTTPS/);
    expect(
      getApiBaseUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "https://api.example.com/",
      }),
    ).toBe("https://api.example.com");
  });

  it("sends authenticated patch requests for draft edits", async () => {
    let request: Request | undefined;
    const client = new (await import("./api-client")).ApiClient({
      baseUrl: "http://api.test",
      token: "session-token",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return new Response(JSON.stringify({ id: "property-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    await client.patch("/owner/properties/property-1", { title: "Updated" });

    expect(request?.method).toBe("PATCH");
    expect(request?.headers.get("Authorization")).toBe("Bearer session-token");
    expect(await request?.json()).toEqual({ title: "Updated" });
  });
});
