"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "../../../lib/api-client";
import en from "../../../i18n/messages/en.json";
import ti from "../../../i18n/messages/ti.json";

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

const authMessages = { en: en.auth, ti: ti.auth } as const;

function message(locale: string, key: string, values: Record<string, string> = {}) {
  let result = String((authMessages[locale === "ti" ? "ti" : "en"] as Record<string, unknown>)[key] ?? key);
  for (const [name, value] of Object.entries(values)) result = result.replace(`{${name}}`, value);
  return result;
}

function localizedError(error: unknown, locale: string, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/too many email verification requests/i.test(raw)) return message(locale, "tooManyEmailRequests");
  if (/email verification could not be delivered/i.test(raw)) return message(locale, "emailDeliveryFailed");
  if (/email verification is required/i.test(raw)) return message(locale, "emailVerificationRequired");
  if (/email verification code is invalid or expired/i.test(raw)) return message(locale, "invalidEmailCode");
  if (/too many otp requests/i.test(raw)) return message(locale, "tooManyOtpRequests");
  if (/otp is invalid or expired|invalid phone or otp/i.test(raw)) return message(locale, "invalidOtp");
  if (/owner authorization attestation/i.test(raw)) return message(locale, "ownerAttestationRequired");
  return message(locale, fallback);
}

export async function signInWithPassword(_previous: AuthState, form: FormData): Promise<AuthState> {
  const locale = localeFrom(form);
  let destination = "";
  try {
    const response = await createApiClient().post<{ session: { token: string }; user: { roles?: string[] } }>("/auth/password/sign-in", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      locale,
    });
    await storeSession(response);
    destination = `/${localeFrom(form)}/${response.user.roles?.includes("ADMIN") ? "admin" : response.user.roles?.includes("VERIFIER") ? "verifier" : "owner"}`;
  } catch (error) {
    return { message: localizedError(error, locale, "genericSignInError") };
  }
  redirect(destination);
}

export async function requestWhatsAppOtp(_previous: AuthState, form: FormData): Promise<AuthState> {
  const locale = localeFrom(form);
  try {
    const response = await createApiClient().post<{ expiresAt: string }>("/auth/owner/phone-otp/request", { phone: String(form.get("phone") ?? ""), locale });
    return { message: message(locale, "whatsappCodeSent", { time: new Date(response.expiresAt).toLocaleTimeString(locale) }) };
  } catch (error) {
    return { message: localizedError(error, locale, "genericOtpError") };
  }
}

export async function requestOwnerEmailVerification(_previous: AuthState, form: FormData): Promise<AuthState> {
  const locale = localeFrom(form);
  try {
    const response = await createApiClient().post<{ expiresAt: string }>("/auth/owner/email-verification/request", { email: String(form.get("email") ?? ""), locale });
    return { message: message(locale, "emailVerificationSent", { time: new Date(response.expiresAt).toLocaleTimeString(locale) }) };
  } catch (error) {
    return { message: localizedError(error, locale, "genericEmailError") };
  }
}

export async function verifyWhatsAppOtp(_previous: AuthState, form: FormData): Promise<AuthState> {
  const locale = localeFrom(form);
  let destination = "";
  try {
    const response = await createApiClient().post<{ session: { token: string }; user: { roles?: string[] } }>("/auth/otp/verify", {
      phone: String(form.get("phone") ?? ""),
      code: String(form.get("code") ?? ""),
      locale,
    });
    await storeSession(response);
    destination = `/${localeFrom(form)}/owner`;
  } catch (error) {
    return { message: localizedError(error, locale, "genericOtpVerificationError") };
  }
  redirect(destination);
}

export async function onboardOwner(_previous: AuthState, form: FormData): Promise<AuthState> {
  const locale = localeFrom(form);
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
      locale,
    });
    await storeSession(response);
    destination = `/${localeFrom(form)}/owner`;
  } catch (error) {
    return { message: localizedError(error, locale, "genericOnboardingError") };
  }
  redirect(destination);
}
