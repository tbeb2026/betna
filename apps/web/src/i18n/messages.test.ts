import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import ti from "./messages/ti.json";

function paths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key));
}

describe("locale catalog parity", () => {
  it("contains every user-visible English key in Tigrinya", () => {
    expect(paths(ti)).toEqual(expect.arrayContaining(paths(en)));
  });
});
