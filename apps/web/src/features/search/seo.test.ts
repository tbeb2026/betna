import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSitemapEntries } from "../../app/[locale]/(public)/sitemap";
import { canonicalLocale, collectionJsonLd } from "./seo";
import { getAllPublicProperties } from "./data";

afterEach(() => vi.unstubAllGlobals());

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

  it("uses English as the canonical locale when a requested translation is unavailable", () => {
    expect(canonicalLocale("ti", [{ availableLocales: ["en"] }])).toBe("en");
    expect(canonicalLocale("ti", [{ availableLocales: ["en", "ti"] }])).toBe("ti");
  });

  it("emits collection JSON-LD for public result pages", () => {
    const data = collectionJsonLd("https://betna.example/en/search", "Verified places", [
      { slug: "kilimani-home", title: "Kilimani home", description: "Verified home" },
    ]);
    expect(data["@type"]).toBe("CollectionPage");
    expect(data.mainEntity.itemListElement[0].url).toContain("/en/property/kilimani-home");
  });

  it("loads every sitemap page from the public API", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ id: String(index), slug: `home-${index}` }))), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "100", slug: "home-100" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const properties = await getAllPublicProperties({ locale: "en" });

    expect(properties).toHaveLength(101);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("page=2");
  });
});
