"use client";

import { useActionState } from "react";
import { onboardOwner, requestWhatsAppOtp, requestOwnerEmailVerification } from "./actions";

type OnboardingLabels = {
  firstNameLabel: string;
  lastNameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  requestWhatsAppCode: string;
  whatsappCodeLabel: string;
  requestEmailVerification: string;
  emailVerificationCodeLabel: string;
  passwordLabel: string;
  authorizationAttestation: string;
  createOwnerAccount: string;
  creatingOwnerAccount: string;
};

export function OnboardingForm({ locale, labels }: { locale: string; labels: OnboardingLabels }) {
  const [state, action, pending] = useActionState(onboardOwner, {});
  const [phoneState, phoneAction, phonePending] = useActionState(requestWhatsAppOtp, {});
  const [emailState, emailAction, emailPending] = useActionState(requestOwnerEmailVerification, {});
  return (
    <form className="auth-form" action={action}>
      <input type="hidden" name="locale" value={locale} />
      <label>{labels.firstNameLabel}<input name="firstName" required /></label>
      <label>{labels.lastNameLabel}<input name="lastName" required /></label>
      <label>{labels.emailLabel}<input name="email" type="email" required /></label>
      <label>{labels.phoneLabel}<input name="phone" type="tel" required /></label>
      <button className="button" type="submit" formAction={phoneAction} formNoValidate disabled={phonePending}>{labels.requestWhatsAppCode}</button>
      {phoneState.message ? <p role="status">{phoneState.message}</p> : null}
      <label>{labels.whatsappCodeLabel}<input name="otpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
      <button className="button" type="submit" formAction={emailAction} formNoValidate disabled={emailPending}>{labels.requestEmailVerification}</button>
      {emailState.message ? <p role="status">{emailState.message}</p> : null}
      <label>{labels.emailVerificationCodeLabel}<input name="emailVerificationCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
      <label>{labels.passwordLabel}<input name="password" type="password" minLength={8} required /></label>
      <label className="check-label"><input name="authorizationAttested" type="checkbox" required /> {labels.authorizationAttestation}</label>
      <button className="button primary" type="submit" formNoValidate disabled={pending}>{pending ? labels.creatingOwnerAccount : labels.createOwnerAccount}</button>
      {state.message ? <p className="form-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
