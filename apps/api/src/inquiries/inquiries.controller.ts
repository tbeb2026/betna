import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { InquiriesService } from "./inquiries.service";

@Controller("public/inquiries")
export class PublicInquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post()
  create(@Body() body: any) {
    return this.inquiries.createGuestInquiry(body);
  }

  @Post("contact-click")
  contactClick(@Body() body: any) {
    return this.inquiries.logContactClick(body);
  }
}

/** Short alias retained for clients that log contact actions outside the inquiry form. */
@Controller("public")
export class PublicContactController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post("contact-click")
  contactClick(@Body() body: any) {
    return this.inquiries.logContactClick(body);
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
    @Param("id") id: string,
    @Body() body: any,
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

  @Post(":id/location-release")
  release(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.inquiries.adminReleaseLocation(id, request.user, body?.reason);
  }

  @Post(":id/location-release/revoke")
  revoke(
    @Req() request: { user: { id: string; roles: string[] } },
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.inquiries.revokeLocation(id, request.user, body?.reason);
  }
}
