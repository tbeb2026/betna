import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthSessionGuard } from "./guards";

export class PasswordSignInDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 200)
  password!: string;
}

export class OtpRequestDto {
  @IsString()
  @Matches(/^\+?[1-9][0-9 ()-]{7,20}$/)
  phone!: string;
}

export class OtpVerifyDto extends OtpRequestDto {
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}

export class OwnerOnboardingDto {
  @IsEmail() email!: string;
  @IsString() @Length(8, 200) password!: string;
  @IsString() @Length(1, 100) firstName!: string;
  @IsString() @Length(1, 100) lastName!: string;
  @IsString() @Matches(/^\+?[1-9][0-9 ()-]{7,20}$/) phone!: string;
  @IsString() @Matches(/^[0-9]{6}$/) otpCode!: string;
  @IsOptional() @IsString() @Matches(/^[0-9]{6}$/) emailVerificationCode?: string;
  @IsOptional() @IsString() @Matches(/^[0-9]{6}$/) emailCode?: string;
  @IsBoolean() authorizationAttested!: boolean;
}

export class OwnerEmailVerificationDto {
  @IsEmail() email!: string;
}

export class OwnerEmailVerificationConfirmDto extends OwnerEmailVerificationDto {
  @IsString() @Matches(/^[0-9]{6}$/) code!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("password/sign-in")
  signInWithPassword(@Body() body: PasswordSignInDto) {
    return this.auth.signInWithPassword(body.email, body.password);
  }

  @Post("otp/request")
  requestOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestOtp(body.phone);
  }

  @Post("owner/phone-otp/request")
  requestOwnerPhoneOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestOwnerPhoneOtp(body.phone);
  }

  @Post("owner/email-verification/request")
  requestOwnerEmailVerification(@Body() body: OwnerEmailVerificationDto) {
    return this.auth.requestOwnerEmailVerification(body.email);
  }

  @Post("owner/email-verification/confirm")
  confirmOwnerEmailVerification(@Body() body: OwnerEmailVerificationConfirmDto) {
    return this.auth.confirmOwnerEmailVerification(body.email, body.code);
  }

  @Post("otp/verify")
  verifyOtp(@Body() body: OtpVerifyDto) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post("owner/onboarding")
  onboardOwner(@Body() body: OwnerOnboardingDto) {
    return this.auth.onboardOwner(body);
  }

  @Post("session/revoke")
  @UseGuards(AuthSessionGuard)
  revokeSession(@Req() request: { session: { id: string } }) {
    return this.auth.revokeSession(request.session.id);
  }

  @Get("session")
  @UseGuards(AuthSessionGuard)
  currentSession(@Req() request: { session: {
    userId: string;
    roles: string[];
    territoryIds: string[];
    expiresAt: Date;
  } }) {
    const { userId, roles, territoryIds, expiresAt } = request.session;
    return { userId, roles, territoryIds, expiresAt: expiresAt.toISOString() };
  }
}
