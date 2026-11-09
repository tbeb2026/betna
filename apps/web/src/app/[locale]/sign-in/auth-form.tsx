"use client";

import { useActionState } from "react";
import { requestWhatsAppOtp, signInWithPassword, verifyWhatsAppOtp } from "./actions";

export function AuthForm({ locale, labels }: { locale: string; labels: Record<string, string> }) {
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPassword, {});
  const [otpRequestState, otpRequestAction, otpRequestPending] = useActionState(requestWhatsAppOtp, {});
  const [otpVerifyState, otpVerifyAction, otpVerifyPending] = useActionState(verifyWhatsAppOtp, {});
  return (
    <div className="auth-methods">
      <form className="auth-form" action={passwordAction}>
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="email">{labels.emailLabel}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">{labels.passwordLabel}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
        <button className="button primary" type="submit" disabled={passwordPending}>{passwordPending ? labels.working : labels.submit}</button>
        {passwordState.message ? <p className="form-error" role="alert">{passwordState.message}</p> : null}
      </form>
      <details>
        <summary>{labels.otpTitle}</summary>
        <form className="auth-form" action={otpRequestAction}>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="otp-phone">{labels.phoneLabel}</label>
          <input id="otp-phone" name="phone" type="tel" autoComplete="tel" required />
          <button className="button secondary" type="submit" disabled={otpRequestPending}>{labels.requestOtp}</button>
          {otpRequestState.message ? <p className="form-help" role="status">{otpRequestState.message}</p> : null}
        </form>
        <form className="auth-form" action={otpVerifyAction}>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="verify-phone">{labels.phoneLabel}</label>
          <input id="verify-phone" name="phone" type="tel" required />
          <label htmlFor="otp-code">{labels.otpCodeLabel}</label>
          <input id="otp-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
          <button className="button primary" type="submit" disabled={otpVerifyPending}>{labels.verifyOtp}</button>
          {otpVerifyState.message ? <p className="form-error" role="alert">{otpVerifyState.message}</p> : null}
        </form>
      </details>
    </div>
  );
}
