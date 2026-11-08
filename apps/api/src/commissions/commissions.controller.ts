import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { CommissionsService } from "./commissions.service";
import { ConversionsService } from "./conversions.service";

@Controller()
@UseGuards(AuthSessionGuard, RolesGuard)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService, private readonly conversions: ConversionsService) {}

  @Get("owner/conversions")
  @Roles("OWNER")
  ownerConversions(@Req() request: { user: { id: string } }) { return this.conversions.listForOwner(request.user.id); }

  @Post("owner/conversions")
  @Roles("OWNER")
  report(@Req() request: { user: { id: string } }, @Body() body: any) { return this.conversions.report({ ...body, ownerId: request.user.id }); }

  @Get("admin/commissions")
  @Roles("ADMIN")
  adminCommissions(@Req() request: { user: { id: string } }) { return this.commissions.listForAdmin(request.user.id); }

  @Get("admin/conversions")
  @Roles("ADMIN")
  adminConversions(@Req() request: { user: { id: string } }) { return this.conversions.listForAdmin(request.user.id); }

  @Post("admin/conversions/:id/verify")
  @Roles("ADMIN")
  verify(@Req() request: { user: { id: string } }, @Param("id") id: string, @Body() body: any) { return this.conversions.verifyEvidence(id, request.user.id, body ?? {}); }

  @Post("admin/conversions/:id/mark-due")
  @Roles("ADMIN")
  markDue(@Req() request: { user: { id: string } }, @Param("id") id: string) { return this.commissions.markDue(id, request.user.id); }

  @Post("admin/commissions/:id/paid")
  @Roles("ADMIN")
  paid(@Req() request: { user: { id: string } }, @Param("id") id: string) { return this.commissions.markPaid(id, request.user.id); }

  @Post("admin/commissions/:id/waive")
  @Roles("ADMIN")
  waive(@Req() request: { user: { id: string } }, @Param("id") id: string) { return this.commissions.waive(id, request.user.id); }

  @Post("admin/commissions/:id/dispute")
  @Roles("ADMIN")
  dispute(@Req() request: { user: { id: string } }, @Param("id") id: string) { return this.commissions.dispute(id, request.user.id); }
}
