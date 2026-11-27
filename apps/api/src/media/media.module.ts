import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { MediaScanJob } from "./scan.job";
import { createConfiguredStorageAdapter, STORAGE_ADAPTER, StorageAdapter } from "./storage.adapter";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [MediaController],
  providers: [MediaService, MediaScanJob, { provide: STORAGE_ADAPTER, useFactory: createConfiguredStorageAdapter }, { provide: StorageAdapter, useExisting: STORAGE_ADAPTER }],
  exports: [MediaService, STORAGE_ADAPTER, StorageAdapter],
})
export class MediaModule {}
