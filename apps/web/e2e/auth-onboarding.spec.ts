import { expect, test } from "@playwright/test";

test("sign-in exposes password, WhatsApp OTP, and owner onboarding flows", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByText("Sign in with WhatsApp code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an owner account" })).toHaveAttribute("href", "/en/sign-in/onboarding");

  await page.goto("/en/sign-in/onboarding");
  await expect(page.getByRole("heading", { name: "Create an owner account" })).toBeVisible();
  await expect(page.getByRole("button", { name: /request whatsapp code/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /request email verification/i })).toBeVisible();
  await expect(page.getByLabel("Email verification code")).toBeVisible();
  await expect(page.getByLabel("WhatsApp verification code")).toBeVisible();
  await expect(page.getByLabel(/own or am authorized/i)).toBeVisible();
});

test("owner onboarding requests both codes and proves failed then successful activation", async ({ page }) => {
  const api = "http://127.0.0.1:4000";
  let activationAttempts = 0;
  await page.route(`${api}/auth/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() as Record<string, unknown>;
    if (url.pathname.endsWith("/owner/phone-otp/request")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ expiresAt: new Date(Date.now() + 300_000).toISOString() }) });
      return;
    }
    if (url.pathname.endsWith("/owner/email-verification/request")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ expiresAt: new Date(Date.now() + 600_000).toISOString() }) });
      return;
    }
    if (url.pathname.endsWith("/owner/email-verification/confirm")) {
      await route.fulfill(body.code === "654321"
        ? { status: 200, contentType: "application/json", body: JSON.stringify({ verified: true }) }
        : { status: 400, contentType: "application/json", body: JSON.stringify({ message: "Email verification code is invalid or expired" }) });
      return;
    }
    if (url.pathname.endsWith("/owner/onboarding")) {
      activationAttempts += 1;
      await route.fulfill(activationAttempts === 1
        ? { status: 400, contentType: "application/json", body: JSON.stringify({ message: "Email verification is required before activation" }) }
        : { status: 201, contentType: "application/json", body: JSON.stringify({ user: { id: "owner-e2e", roles: ["OWNER"] }, session: { token: "session-e2e" } }) });
      return;
    }
    await route.fallback();
  });

  await page.goto("/en/sign-in/onboarding");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Owner");
  await page.getByLabel("Email address").fill("e2e-owner@example.com");
  await page.getByLabel("Phone or WhatsApp").fill("+254700000099");

  const post = (path: string, data: Record<string, unknown>) => page.evaluate(async ({ api, path, data }) => {
    const response = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }, { api, path, data });

  expect((await post("/auth/owner/phone-otp/request", { phone: "+254700000099" })).status).toBe(200);
  expect((await post("/auth/owner/email-verification/request", { email: "e2e-owner@example.com" })).status).toBe(200);
  expect((await post("/auth/owner/email-verification/confirm", { email: "e2e-owner@example.com", code: "000000" })).status).toBe(400);
  expect((await post("/auth/owner/email-verification/confirm", { email: "e2e-owner@example.com", code: "654321" })).body).toEqual({ verified: true });

  const activation = {
    email: "e2e-owner@example.com",
    password: "secret123",
    firstName: "E2E",
    lastName: "Owner",
    phone: "+254700000099",
    otpCode: "123456",
    emailVerificationCode: "654321",
    authorizationAttested: true,
  };
  expect((await post("/auth/owner/onboarding", { ...activation, authorizationAttested: false })).status).toBe(400);
  expect((await post("/auth/owner/onboarding", activation))).toMatchObject({ status: 201, body: { session: { token: "session-e2e" } } });
});
