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
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { InspectionsService } from "./inspections.service";

@Controller("verification")
@UseGuards(AuthSessionGuard, RolesGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get("checklist/:category")
  @Roles("VERIFIER", "ADMIN")
  checklist(@Param("category") category: string) {
    return this.inspections.getChecklist(category);
  }

  @Get("inspections")
  @Roles("VERIFIER")
  list(@Req() request: { user: { id: string; territoryIds?: string[] } }) {
    return this.inspections.listForVerifier(
      request.user.id,
      request.user.territoryIds,
    );
  }

  @Post("inspections/:id/submit")
  @Roles("VERIFIER")
  submit(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body()
    body: {
      checklist: Record<string, unknown>;
      evidence: Array<{ mediaId: string }>;
      notes?: string;
    },
  ) {
    return this.inspections.submitPendingUpload(id, request.user.id, body);
  }

  @Post("inspections/:id/evidence/:mediaId/sync")
  @Roles("VERIFIER")
  sync(
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
    @Body() body: { ok?: boolean; validated?: boolean },
  ) {
    return this.inspections.markEvidenceSynced(id, mediaId, body);
  }

  @Patch("inspections/:id/review")
  @Roles("ADMIN")
  review(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id") id: string,
    @Body() body: { decision: "APPROVED" | "REJECTED"; notes?: string },
  ) {
    return this.inspections.adminReview(
      id,
      request.user,
      body.decision,
      body.notes,
    );
  }
}
