import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { AvailabilityService } from "./availability.service";

@Controller("owner/availability")
@UseGuards(AuthSessionGuard, RolesGuard)
@Roles("OWNER")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  list(@Req() request: { user: { id: string } }, @Query("propertyId") propertyId?: string) {
    return this.availability.listForOwner(request.user.id, propertyId);
  }

  @Post("inquiries/:id/confirm")
  confirm(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    return this.availability.confirmInquiryAndBlockDates(id, request.user.id);
  }

  @Post("inquiries/:id/decline")
  decline(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    return this.availability.ownerDeclineInquiry(id, request.user.id);
  }
}
