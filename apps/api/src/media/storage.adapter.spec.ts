import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { normalizeImageType, StorageAdapter } from "./storage.adapter";

async function makeJpeg() {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
}

describe("StorageAdapter", () => {
  it("rejects bytes whose content is not an image or exceeds the claimed size", async () => {
    const storage = new StorageAdapter({
      signingSecret: "test-secret",
      fetcher: vi.fn(
        async () =>
          new Response(Buffer.from("MZ executable"), {
            status: 200,
            headers: { "content-type": "image/jpeg" },
          }),
      ),
    });

    await expect(
      storage.scan("public/listings/property-1/media-1/original.jpg", {
        contentType: "image/jpeg",
        maxBytes: 1,
      }),
    ).resolves.toMatchObject({ clean: false });
  });

  it("writes every responsive derivative after decoding the source bytes", async () => {
    const jpeg = await makeJpeg();
    const writes: Array<{
      key: string;
      body: Uint8Array;
      contentType: string;
    }> = [];
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          writes.push({
            key: new URL(String(input)).searchParams.get("key") ?? "",
            body: new Uint8Array((init.body as Uint8Array) ?? []),
            contentType: String(new Headers(init.headers).get("content-type")),
          });
          return new Response(null, { status: 200 });
        }
        return new Response(jpeg, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      },
    );
    const storage = new StorageAdapter({
      signingSecret: "test-secret",
      fetcher,
    });

    await storage.generateVariants(
      "public/listings/property-1/media-1/original.jpg",
      "image/jpeg",
    );

    expect(writes).toHaveLength(3);
    expect(writes.map(({ key }) => key)).toEqual([
      "public/listings/property-1/media-1.w320.webp",
      "public/listings/property-1/media-1.w640.webp",
      "public/listings/property-1/media-1.w1280.webp",
    ]);
    expect(writes.every(({ body }) => body.length > 0)).toBe(true);
    expect(
      writes.every(({ contentType }) => contentType === "image/webp"),
    ).toBe(true);
  });

  it("requires an explicit signing secret outside development and test safety modes", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.MEDIA_SIGNING_SECRET;
    const previousTestAuth = process.env.BETNA_TEST_AUTH;
    process.env.NODE_ENV = "production";
    process.env.BETNA_TEST_AUTH = "1";
    delete process.env.MEDIA_SIGNING_SECRET;

    expect(() => new StorageAdapter()).toThrow(/MEDIA_SIGNING_SECRET/);

    process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.MEDIA_SIGNING_SECRET;
    else process.env.MEDIA_SIGNING_SECRET = previousSecret;
    if (previousTestAuth === undefined) delete process.env.BETNA_TEST_AUTH;
    else process.env.BETNA_TEST_AUTH = previousTestAuth;
  });

  it("treats HEIC and HEIF declarations as one detected image family", () => {
    expect(normalizeImageType("image/heic")).toBe("image/heif");
    expect(normalizeImageType("image/heif; charset=binary")).toBe("image/heif");
  });
});
