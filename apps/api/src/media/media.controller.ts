import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { MediaPurpose, MediaService } from "./media.service";

type RequestWithUser = { user: { id: string; roles: string[] } };
type CreateUploadTargetBody = {
  purpose: MediaPurpose;
  propertyId?: string;
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
};

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("upload-target")
  @UseGuards(AuthSessionGuard, RolesGuard)
  @Roles("OWNER", "VERIFIER", "ADMIN")
  createUploadTarget(
    @Req() request: RequestWithUser,
    @Body() body: CreateUploadTargetBody,
  ) {
    return this.media.createUploadTarget(request.user, body.purpose, body);
  }

  @Post(":id/complete")
  @UseGuards(AuthSessionGuard, RolesGuard)
  @Roles("OWNER", "VERIFIER", "ADMIN")
  complete(@Param("id") id: string) {
    return this.media.completeUpload(id);
  }

  @Get(":id/variants")
  publicVariants(@Param("id") id: string) {
    return this.media.getPublicVariants(id);
  }

  @Get(":id/private-url")
  @UseGuards(AuthSessionGuard)
  privateUrl(@Req() request: RequestWithUser, @Param("id") id: string) {
    return this.media.getPrivateUrl(id, request.user);
  }
}
