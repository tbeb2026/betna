import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageAdapter } from "./storage.adapter";

export type MediaScanRecord = {
  id: string;
  purpose: "LISTING" | "INSPECTION_EVIDENCE";
  objectKey: string;
  status: "PENDING" | "CLEAN" | "REJECTED";
  isPublic: boolean;
  [key: string]: unknown;
};

@Injectable()
export class MediaScanJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageAdapter,
  ) {}

  async process(mediaId: string): Promise<MediaScanRecord> {
    const media = (await this.prisma.media.findUnique({
      where: { id: mediaId },
    })) as MediaScanRecord | null;
    if (!media) throw new Error("Media not found");

    const result = await this.storage.scan(media.objectKey);
    const status = result.clean ? "CLEAN" : "REJECTED";
    const isPublic = result.clean && media.purpose === "LISTING";
    // Generate listing derivatives before publishing the database row. If the
    // image processor fails, the media remains pending/private and can be
    // retried without exposing an incomplete listing image.
    if (result.clean && media.purpose === "LISTING") {
      const generateVariants = (this.storage as any).generateVariants;
      if (typeof generateVariants === "function") {
        await generateVariants.call(
          this.storage,
          media.objectKey,
          media.contentType,
        );
      }
    }

    // Inspection evidence is intentionally never deleted, even when rejected.
    // A production worker can quarantine the object separately without changing
    // this durable audit record.
    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { status, isPublic },
    });
    return updated as MediaScanRecord;
  }
}
