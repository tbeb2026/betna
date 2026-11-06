import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("password/sign-in")
  signInWithPassword(@Body() body: { email: string; password: string }) {
    return this.auth.signInWithPassword(body.email, body.password);
  }

  @Post("otp/request")
  requestOtp(@Body() body: { phone: string }) {
    return this.auth.requestOtp(body.phone);
  }

  @Post("otp/verify")
  verifyOtp(@Body() body: { phone: string; code: string }) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post("session/revoke")
  revokeSession(@Body() body: { token: string }) {
    return this.auth.revokeSession(body.token);
  }
}
