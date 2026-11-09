import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { AvailabilityService } from "./availability.service";

class CreateUnavailableDateDto {
  @IsUUID()
  propertyId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

class UpdateUnavailableDateDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

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

  @Get("unavailable")
  unavailable(
    @Req() request: { user: { id: string } },
    @Query("propertyId") propertyId?: string,
  ) {
    return this.availability.listUnavailableForOwner(request.user.id, propertyId);
  }

  @Post("unavailable")
  createUnavailable(
    @Req() request: { user: { id: string } },
    @Body() body: CreateUnavailableDateDto,
  ) {
    return this.availability.createUnavailableDate(request.user.id, body);
  }

  @Patch("unavailable/:id")
  updateUnavailable(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body() body: UpdateUnavailableDateDto,
  ) {
    return this.availability.updateUnavailableDate(request.user.id, id, body);
  }

  @Delete("unavailable/:id")
  deleteUnavailable(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    return this.availability.deleteUnavailableDate(request.user.id, id);
  }
}
