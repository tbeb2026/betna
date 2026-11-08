import { describe, expect, it } from "vitest";
import { buildSitemapEntries } from "../../app/[locale]/(public)/sitemap";

describe("public property SEO", () => {
  it("includes only locales with published property content", () => {
    const entries = buildSitemapEntries([
      { slug: "english-only", availableLocales: ["en"] },
      { slug: "translated-home", availableLocales: ["en", "ti"] },
    ], "https://betna.example");

    const urls = entries.map((entry) => String(entry.url));
    expect(urls).toContain("https://betna.example/en/property/english-only");
    expect(urls).not.toContain("https://betna.example/ti/property/english-only");
    expect(urls).toContain("https://betna.example/en/property/translated-home");
    expect(urls).toContain("https://betna.example/ti/property/translated-home");
  });
});
