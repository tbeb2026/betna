import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/en/search", "/ti/search", "/en/property/", "/ti/property/"], disallow: ["/admin/", "/owner/", "/verifier/", "/en/admin/", "/en/owner/", "/en/verifier/", "/ti/admin/", "/ti/owner/", "/ti/verifier/"] }], sitemap: `${siteUrl}/sitemap.xml` };
}
