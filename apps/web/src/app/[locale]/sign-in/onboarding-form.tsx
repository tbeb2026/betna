"use client";

import { useActionState } from "react";
import { onboardOwner, requestWhatsAppOtp, requestOwnerEmailVerification } from "./actions";

export function OnboardingForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(onboardOwner, {});
  const [phoneState, phoneAction, phonePending] = useActionState(requestWhatsAppOtp, {});
  const [emailState, emailAction, emailPending] = useActionState(requestOwnerEmailVerification, {});
  return (
    <form className="auth-form" action={action}>
      <input type="hidden" name="locale" value={locale} />
      <label>First name<input name="firstName" required /></label>
      <label>Last name<input name="lastName" required /></label>
      <label>Email address<input name="email" type="email" required /></label>
      <label>Phone or WhatsApp<input name="phone" type="tel" required /></label>
      <button className="button" type="submit" formAction={phoneAction} formNoValidate disabled={phonePending}>Request WhatsApp code</button>
      {phoneState.message ? <p role="status">{phoneState.message}</p> : null}
      <label>WhatsApp verification code<input name="otpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
      <button className="button" type="submit" formAction={emailAction} formNoValidate disabled={emailPending}>Request email verification</button>
      {emailState.message ? <p role="status">{emailState.message}</p> : null}
      <label>Email verification code<input name="emailVerificationCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
      <label>Password<input name="password" type="password" minLength={8} required /></label>
      <label className="check-label"><input name="authorizationAttested" type="checkbox" required /> I confirm that I own or am authorized to list my places.</label>
      <button className="button primary" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create owner account"}</button>
      {state.message ? <p className="form-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
