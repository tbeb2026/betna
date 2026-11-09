import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { MediaScanJob } from "./scan.job";
import { StorageAdapter } from "./storage.adapter";

@Module({
  imports: [AuditModule],
  controllers: [MediaController],
  providers: [MediaService, MediaScanJob, StorageAdapter],
  exports: [MediaService],
})
export class MediaModule {}
