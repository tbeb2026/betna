import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { InquiriesService } from "./inquiries.service";

export class GuestInquiryDto {
  @IsUUID("4") propertyId!: string;
  @IsOptional() @IsUUID("4") offeringId?: string;
  @IsIn(["SHORT_STAY", "LONG_TERM"]) mode!: "SHORT_STAY" | "LONG_TERM";
  @IsString() @MaxLength(160) name!: string;
  @IsEmail() email!: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{7,25}$/) phone!: string;
  @IsString() @MaxLength(4000) message!: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) guests?: number;
  @IsOptional() @IsString() @MaxLength(128) honeypot?: string;
  @IsOptional() @IsString() @MaxLength(128) fingerprint?: string;
}

export class ContactClickDto {
  @IsUUID("4") propertyId!: string;
  @IsIn(["BETNA", "OWNER"]) target!: "BETNA" | "OWNER";
  @IsIn(["WHATSAPP", "EMAIL"]) channel!: "WHATSAPP" | "EMAIL";
}

class OwnerResponseDto {
  @IsIn(["CONFIRMED", "DECLINED"]) decision!: "CONFIRMED" | "DECLINED";
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
}

export class AdminLocationReleaseDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

@Controller("public/inquiries")
export class PublicInquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post()
  create(@Body() body: GuestInquiryDto) {
    return this.inquiries.createGuestInquiry(body);
  }

  @Post("contact-click")
  contactClick(@Body() body: ContactClickDto) {
    return this.inquiries.logContactClick(body);
  }

  @Get("released-location")
  releasedLocation(@Query("token") token?: string) {
    return this.inquiries.getReleasedLocationByToken(token ?? "");
  }
}

/** Short alias retained for clients that log contact actions outside the inquiry form. */
@Controller("public")
export class PublicContactController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post("contact-click")
  contactClick(@Body() body: ContactClickDto) {
    return this.inquiries.logContactClick(body);
  }

  @Get("properties/:propertyId/contact-owner")
  async ownerContact(
    @Param("propertyId", new ParseUUIDPipe({ version: "4" })) propertyId: string,
    @Res() response: { redirect: (status: number, url: string) => unknown },
  ) {
    const target = await this.inquiries.ownerContactRedirect(propertyId);
    return response.redirect(302, target);
  }
}

@Controller("owner/inquiries")
@UseGuards(AuthSessionGuard, RolesGuard)
@Roles("OWNER")
export class OwnerInquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Get()
  list(@Req() request: { user: { id: string } }) {
    return this.inquiries.listForOwner(request.user.id);
  }

  @Post(":id/respond")
  respond(
    @Req() request: { user: { id: string } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: OwnerResponseDto,
  ) {
    return this.inquiries.ownerRespond(id, request.user.id, body);
  }
}

@Controller("admin/inquiries")
@UseGuards(AuthSessionGuard, RolesGuard)
@Roles("ADMIN")
export class AdminInquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Get()
  list() {
    return this.inquiries.listForAdmin();
  }

  @Get(":id/location")
  exactLocation(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.inquiries.getReleasedLocation(id, request.user);
  }

  @Post(":id/location-release")
  release(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: AdminLocationReleaseDto,
  ) {
    return this.inquiries.adminReleaseLocation(id, request.user, body?.reason);
  }

  @Post(":id/location-release/revoke")
  revoke(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: AdminLocationReleaseDto,
  ) {
    return this.inquiries.revokeLocation(id, request.user, body?.reason);
  }
}
