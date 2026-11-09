import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { InspectionsService } from "./inspections.service";
import { ChecklistService } from "./checklist.service";

class ChecklistDefinitionDto {
  @IsArray()
  @IsString({ each: true })
  required!: string[];

  @IsOptional()
  @IsObject()
  rules?: Record<string, string>;
}

class AssignInspectionDto {
  @IsUUID()
  verifierId!: string;
}

class InspectionEvidenceDto {
  @IsUUID()
  mediaId!: string;
}

class SubmitInspectionDto {
  @IsObject()
  checklist!: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionEvidenceDto)
  evidence!: InspectionEvidenceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestKey?: string;
}

class SyncEvidenceDto {
  @IsOptional()
  @IsBoolean()
  ok?: boolean;

  @IsOptional()
  @IsBoolean()
  validated?: boolean;
}

class ReviewInspectionDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

@Controller("verification")
@UseGuards(AuthSessionGuard, RolesGuard)
export class InspectionsController {
  constructor(
    private readonly inspections: InspectionsService,
    private readonly checklistDefinitions: ChecklistService,
  ) {}

  @Get("checklist/:category")
  @Roles("VERIFIER", "ADMIN")
  checklist(@Param("category") category: string) {
    return this.inspections.getChecklist(category);
  }

  @Get("checklists")
  @Roles("ADMIN")
  definitions() {
    return this.checklistDefinitions.listDefinitions();
  }

  @Post("checklists/:category")
  @Roles("ADMIN")
  upsertDefinition(
    @Param("category") category: string,
    @Body() body: ChecklistDefinitionDto,
  ) {
    return this.checklistDefinitions.upsertDefinition(category, body);
  }

  @Get("inspections")
  @Roles("VERIFIER")
  list(@Req() request: { user: { id: string; territoryIds?: string[] } }) {
    return this.inspections.listForVerifier(
      request.user.id,
      request.user.territoryIds,
    );
  }

  @Post("inspections/:id/assign")
  @Roles("ADMIN")
  assign(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id") id: string,
    @Body() body: AssignInspectionDto,
  ) {
    return this.inspections.assign(id, body.verifierId, request.user);
  }

  @Get("inspections/review")
  @Roles("ADMIN")
  reviewQueue() {
    return this.inspections.listForAdmin();
  }

  @Get("inspections/:id")
  @Roles("VERIFIER")
  get(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
  ) {
    return this.inspections.getForVerifier(id, request.user.id);
  }

  @Post("inspections/:id/submit")
  @Roles("VERIFIER")
  submit(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body() body: SubmitInspectionDto,
  ) {
    return this.inspections.submitPendingUpload(id, request.user.id, body);
  }

  @Post("inspections/:id/evidence/:mediaId/sync")
  @Roles("VERIFIER")
  sync(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
    @Body() body: SyncEvidenceDto,
  ) {
    return this.inspections.markEvidenceSynced(
      id,
      mediaId,
      body,
      request.user.id,
    );
  }

  @Patch("inspections/:id/review")
  @Roles("ADMIN")
  review(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id") id: string,
    @Body() body: ReviewInspectionDto,
  ) {
    return this.inspections.adminReview(
      id,
      request.user,
      body.decision,
      body.notes,
    );
  }
}
