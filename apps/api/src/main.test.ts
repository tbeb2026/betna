import { describe, expect, it } from "vitest";
import { getApiPort } from "./runtime";

describe("API port resolution", () => {
  it("uses API_PORT and the documented 4000 default", () => {
    expect(getApiPort({ API_PORT: "4400" })).toBe(4400);
    expect(getApiPort({})).toBe(4000);
  });
});
