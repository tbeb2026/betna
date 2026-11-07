import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { InspectionsController } from "./inspections.controller";
import { AssignmentsService } from "./assignments.service";
import { ChecklistService } from "./checklist.service";
import { InspectionsService } from "./inspections.service";

@Module({
  imports: [MediaModule],
  controllers: [InspectionsController],
  providers: [AssignmentsService, ChecklistService, InspectionsService],
  exports: [AssignmentsService, ChecklistService, InspectionsService],
})
export class VerificationModule {}
