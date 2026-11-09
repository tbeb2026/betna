import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from "class-validator";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { MediaPurpose, MediaService } from "./media.service";

type RequestWithUser = { user: { id: string; roles: string[] } };
class CreateUploadTargetBody {
  @IsIn(["LISTING", "INSPECTION_EVIDENCE"])
  purpose!: MediaPurpose;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  inspectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contentType?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(25_000_000)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

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
  complete(@Req() request: RequestWithUser, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.media.completeUpload(id, request.user);
  }

  @Get(":id/variants")
  publicVariants(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.media.getPublicVariants(id);
  }

  @Get(":id/private-url")
  @UseGuards(AuthSessionGuard)
  privateUrl(@Req() request: RequestWithUser, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.media.getPrivateUrl(id, request.user);
  }
}
