"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "../../../lib/api-client";

type AuthState = { message?: string };

async function storeSession(response: { session?: { token?: string } }) {
  const token = response.session?.token;
  if (!token) throw new Error("The sign-in response did not include a session");
  (await cookies()).set("betna_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function localeFrom(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  return locale === "ti" ? "ti" : "en";
}

export async function signInWithPassword(_previous: AuthState, form: FormData): Promise<AuthState> {
  let destination = "";
  try {
    const response = await createApiClient().post<{ session: { token: string }; user: { roles?: string[] } }>("/auth/password/sign-in", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    await storeSession(response);
    destination = `/${localeFrom(form)}/${response.user.roles?.includes("ADMIN") ? "admin" : response.user.roles?.includes("VERIFIER") ? "verifier" : "owner"}`;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Sign-in failed" };
  }
  redirect(destination);
}

export async function requestWhatsAppOtp(_previous: AuthState, form: FormData): Promise<AuthState> {
  try {
    const response = await createApiClient().post<{ expiresAt: string }>("/auth/owner/phone-otp/request", { phone: String(form.get("phone") ?? "") });
    return { message: `Code sent. It expires at ${new Date(response.expiresAt).toLocaleTimeString()}.` };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Could not send a WhatsApp code" };
  }
}

export async function requestOwnerEmailVerification(_previous: AuthState, form: FormData): Promise<AuthState> {
  try {
    const response = await createApiClient().post<{ expiresAt: string }>("/auth/owner/email-verification/request", { email: String(form.get("email") ?? "") });
    return { message: `Verification email sent. It expires at ${new Date(response.expiresAt).toLocaleTimeString()}.` };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Could not send an email verification code" };
  }
}

export async function verifyWhatsAppOtp(_previous: AuthState, form: FormData): Promise<AuthState> {
  let destination = "";
  try {
    const response = await createApiClient().post<{ session: { token: string }; user: { roles?: string[] } }>("/auth/otp/verify", {
      phone: String(form.get("phone") ?? ""),
      code: String(form.get("code") ?? ""),
    });
    await storeSession(response);
    destination = `/${localeFrom(form)}/owner`;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "OTP verification failed" };
  }
  redirect(destination);
}

export async function onboardOwner(_previous: AuthState, form: FormData): Promise<AuthState> {
  let destination = "";
  try {
    const response = await createApiClient().post<{ session: { token: string } }>("/auth/owner/onboarding", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      otpCode: String(form.get("otpCode") ?? ""),
      emailVerificationCode: String(form.get("emailVerificationCode") ?? ""),
      authorizationAttested: form.get("authorizationAttested") === "on",
    });
    await storeSession(response);
    destination = `/${localeFrom(form)}/owner`;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Owner onboarding failed" };
  }
  redirect(destination);
}
