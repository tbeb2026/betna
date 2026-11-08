import { describe, expect, it } from "vitest";
import { redactLogValue } from "./structured-logger";

describe("structured log redaction", () => {
  it("removes credentials, payloads, and URLs from error metadata", () => {
    expect(
      redactLogValue({
        authorization: "Bearer private-token",
        password: "secret",
        path: "/health?token=private-token",
        error: "fetch failed for https://api.example.test/path?secret=value",
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      password: "[REDACTED]",
      path: "/health",
      error: "fetch failed for [REDACTED_URL]",
    });
  });
});
