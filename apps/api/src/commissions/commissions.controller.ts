import { Body, BadRequestException, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsString, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { CommissionsService } from "./commissions.service";
import { ConversionsService } from "./conversions.service";

export class ConversionReportDto {
  @IsString()
  @MaxLength(100)
  inquiryId!: string;

  @Transform(({ value }) => typeof value === "number" ? String(value) : value)
  @IsString()
  @Matches(/^\d+(?:\.\d+)?$/)
  firstPaymentAmount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  firstPaymentCurrency!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2_000)
  paymentEvidence?: string;
}

export class VerifyEvidenceDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2_000)
  paymentEvidence?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  approved?: boolean;
}

@Controller()
@UseGuards(AuthSessionGuard, RolesGuard)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService, private readonly conversions: ConversionsService) {}

  @Get("owner/conversions")
  @Roles("OWNER")
  ownerConversions(@Req() request: { user: { id: string } }) { return this.conversions.listForOwner(request.user.id); }

  @Post("owner/conversions")
  @Roles("OWNER")
  report(@Req() request: { user: { id: string } }, @Body() body: ConversionReportDto) {
    assertMutationBody(body);
    return this.conversions.report({ ...body, ownerId: request.user.id });
  }

  @Get("admin/commissions")
  @Roles("ADMIN")
  adminCommissions(@Req() request: { user: { id: string } }) { return this.commissions.listForAdmin(request.user.id); }

  @Get("admin/conversions")
  @Roles("ADMIN")
  adminConversions(@Req() request: { user: { id: string } }) { return this.conversions.listForAdmin(request.user.id); }

  @Post("admin/conversions/:id/verify")
  @Roles("ADMIN")
  verify(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body() body: VerifyEvidenceDto,
  ) {
    assertMutationBody(body);
    return this.conversions.verifyEvidence(id, request.user.id, body);
  }

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

function assertMutationBody(body: unknown): asserts body is object {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Request body must be an object");
  }
  if (containsNull(body)) {
    throw new BadRequestException("Request body contains an invalid null value");
  }
}

function containsNull(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.some(containsNull);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(containsNull);
}
