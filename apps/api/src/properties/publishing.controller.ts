import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { PublishingService } from "./publishing.service";
import { TranslationService } from "./translation.service";

class MaterialEditLocationDto {
  @IsString()
  @MaxLength(500)
  address!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class MaterialEditPublicLocationDto {
  @IsString()
  @MaxLength(240)
  label!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class MaterialEditOfferingDto {
  @IsIn(["SHORT_STAY", "LONG_TERM"])
  mode!: "SHORT_STAY" | "LONG_TERM";

  @IsIn(["KES", "UGX"])
  currency!: "KES" | "UGX";

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  minimumNights?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  moveInDate?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  leaseDurationMonths?: number;
}

export class FraudReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class MaterialEditDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  amenities?: string[];

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(240)
  publicLocationLabel?: string;

  @ValidateIf((_, value) => value !== undefined)
  @ValidateNested()
  @Type(() => MaterialEditPublicLocationDto)
  publicLocation?: MaterialEditPublicLocationDto;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  publicLatitude?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  publicLongitude?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  basePrice?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialEditOfferingDto)
  offerings?: MaterialEditOfferingDto[];

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsUUID("4", { each: true })
  media?: string[];

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsUUID("4", { each: true })
  mediaIds?: string[];

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsUUID("4", { each: true })
  corePhotos?: string[];

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  exactAddress?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  exactLatitude?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  exactLongitude?: number;

  @ValidateIf((_, value) => value !== undefined)
  @ValidateNested()
  @Type(() => MaterialEditLocationDto)
  exactLocation?: MaterialEditLocationDto;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  bedrooms?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  capacity?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(4_000)
  safetyNotes?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  authorizationAttested?: boolean;
}

export class OwnershipChangeDto {
  @IsUUID("4")
  newOwnerId!: string;
}

export class TranslationApprovalDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(10_000)
  description!: string;
}

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
  publish(@Req() request: { user: { id: string } }, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.publishing.publish(id, request.user.id);
  }

  @Post("publishing/:id/fraud")
  fraud(
    @Req() request: { user: { id: string } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: FraudReportDto,
  ) {
    return this.publishing.reportFraud(id, body, request.user.id);
  }

  @Patch("publishing/:id/material-edit")
  materialEdit(
    @Req() request: { user: { id: string } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: MaterialEditDto,
  ) {
    return this.publishing.createMaterialEditReview(
      id,
      body as unknown as Record<string, unknown>,
      request.user.id,
    );
  }

  @Patch("publishing/:id/ownership-change")
  ownershipChange(
    @Req() request: { user: { id: string; roles?: unknown[] } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: OwnershipChangeDto,
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
    @Param("propertyId", new ParseUUIDPipe({ version: "4" })) propertyId: string,
    @Param("locale") locale: string,
    @Body() body: TranslationApprovalDto,
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
