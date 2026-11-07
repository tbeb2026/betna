import { createHmac, timingSafeEqual } from "node:crypto";

export type StorageVariant = {
  width: number;
  key: string;
};

export type ScanResult = {
  clean: boolean;
  reason?: string;
};

export type StorageAdapterOptions = {
  uploadBaseUrl?: string;
  readBaseUrl?: string;
  signingSecret?: string;
  uploadTtlSeconds?: number;
  readTtlSeconds?: number;
};

/**
 * The application talks to this small adapter instead of coupling media
 * workflows to S3, MinIO, or a local filesystem. Production can replace the
 * implementation while retaining the prefix and signing invariants.
 */
export class StorageAdapter {
  private readonly uploadBaseUrl: string;
  private readonly readBaseUrl: string;
  private readonly signingSecret: string;
  private readonly uploadTtlSeconds: number;
  private readonly readTtlSeconds: number;

  constructor(options: StorageAdapterOptions = {}) {
    this.uploadBaseUrl = (
      options.uploadBaseUrl ??
      process.env.MEDIA_UPLOAD_BASE_URL ??
      "http://storage.local/upload"
    ).replace(/\/$/, "");
    this.readBaseUrl = (
      options.readBaseUrl ??
      process.env.MEDIA_READ_BASE_URL ??
      "http://storage.local/read"
    ).replace(/\/$/, "");
    this.signingSecret =
      options.signingSecret ??
      process.env.MEDIA_SIGNING_SECRET ??
      "betna-development-media-secret";
    this.uploadTtlSeconds = options.uploadTtlSeconds ?? 900;
    this.readTtlSeconds = options.readTtlSeconds ?? 300;
  }

  async createSignedUploadUrl(
    objectKey: string,
    contentType: string,
    maxBytes: number,
  ): Promise<string> {
    return this.signedUrl(
      this.uploadBaseUrl,
      objectKey,
      this.uploadTtlSeconds,
      { contentType, maxBytes: String(maxBytes), method: "PUT" },
    );
  }

  async createSignedReadUrl(
    objectKey: string,
    expiresInSeconds = this.readTtlSeconds,
  ): Promise<string> {
    return this.signedUrl(this.readBaseUrl, objectKey, expiresInSeconds, {
      method: "GET",
    });
  }

  /** Hook for a real antivirus service; the default rejects explicit test markers. */
  async scan(objectKey: string): Promise<ScanResult> {
    if (/eicar|malware|virus/i.test(objectKey)) {
      return { clean: false, reason: "Malware signature detected" };
    }
    return { clean: true };
  }

  responsiveVariants(objectKey: string): StorageVariant[] {
    const marker = "/original.";
    const index = objectKey.lastIndexOf(marker);
    const base = index >= 0 ? objectKey.slice(0, index) : objectKey;
    const extension =
      index >= 0 ? objectKey.slice(index + marker.length) : "jpg";
    return [320, 640, 1280].map((width) => ({
      width,
      key: `${base}.w${width}.${extension}`,
    }));
  }

  /** Generate (or enqueue) responsive derivatives in a concrete object store. */
  async generateVariants(
    objectKey: string,
    _contentType: string,
  ): Promise<StorageVariant[]> {
    return this.responsiveVariants(objectKey);
  }

  private signedUrl(
    baseUrl: string,
    objectKey: string,
    ttlSeconds: number,
    extra: Record<string, string>,
  ): string {
    if (!objectKey || objectKey.startsWith("/") || objectKey.includes("..")) {
      throw new Error("Invalid storage object key");
    }
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = this.sign(objectKey, expires, extra);
    const query = new URLSearchParams({
      key: objectKey,
      expires: String(expires),
      signature,
      ...extra,
    });
    return `${baseUrl}?${query.toString()}`;
  }

  private sign(
    objectKey: string,
    expires: number,
    extra: Record<string, string>,
  ): string {
    const payload = `${objectKey}:${expires}:${Object.entries(extra)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&")}`;
    return createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("hex");
  }

  /** Utility used by adapters/tests that need to validate generated targets. */
  verifySignature(
    objectKey: string,
    expires: number,
    signature: string,
    extra: Record<string, string> = {},
  ): boolean {
    if (expires < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(objectKey, expires, extra));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
