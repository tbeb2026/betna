import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { PublishingService } from "./publishing.service";
import { TranslationService } from "./translation.service";

@Controller("admin")
@UseGuards(AuthSessionGuard, RolesGuard)
@Roles("ADMIN")
export class PublishingController {
  constructor(
    private readonly publishing: PublishingService,
    private readonly translations: TranslationService,
  ) {}

  @Get("publishing")
  queue() {
    return this.publishing.listPublishingQueue();
  }

  @Post("publishing/:id/publish")
  publish(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    return this.publishing.publish(id, request.user.id);
  }

  @Post("publishing/:id/fraud")
  fraud(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.publishing.reportFraud(id, body, request.user.id);
  }

  @Patch("publishing/:id/material-edit")
  materialEdit(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.publishing.createMaterialEditReview(id, body, request.user.id);
  }

  @Patch("publishing/:id/ownership-change")
  ownershipChange(
    @Req() request: { user: { id: string; roles?: unknown[] } },
    @Param("id") id: string,
    @Body() body: { newOwnerId: string },
  ) {
    return this.publishing.reverifyOwnershipChange(
      id,
      body?.newOwnerId,
      request.user,
    );
  }

  @Get("translations")
  translationQueue() {
    return this.translations.listPending();
  }

  @Post("translations/:propertyId/:locale/approve")
  approveTranslation(
    @Req() request: { user: { id: string } },
    @Param("propertyId") propertyId: string,
    @Param("locale") locale: string,
    @Body() body: { title: string; description: string },
  ) {
    return this.translations.upsertApprovedTranslation(
      propertyId,
      locale,
      body,
      undefined,
      request.user.id,
    );
  }
}
