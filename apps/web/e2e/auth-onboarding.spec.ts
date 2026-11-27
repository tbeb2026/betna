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
  await page.goto("/en/sign-in/onboarding");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Owner");
  await page.getByLabel("Email address").fill("e2e-owner@example.com");
  await page.getByLabel("Phone or WhatsApp").fill("+254700000099");

  await page.getByRole("button", { name: /request whatsapp code/i }).click();
  await expect(page.locator('p[role="status"]').nth(0)).toContainText("Code sent");
  await page.getByRole("button", { name: /request email verification/i }).click();
  await expect(page.locator('p[role="status"]').nth(1)).toContainText("Verification email sent");

  await page.getByLabel("WhatsApp verification code").fill("123456");
  await page.getByLabel("Email verification code").fill("000000");
  await page.getByLabel("Password").fill("secret123");
  await page.getByLabel(/own or am authorized/i).check();
  await page.getByRole("button", { name: /create owner account/i }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(/email verification code is invalid or expired/i);

  await page.getByLabel("Email verification code").fill("654321");
  await page.getByRole("button", { name: /create owner account/i }).click();
  await expect(page).toHaveURL(/\/en\/owner$/);
  await expect(page.getByRole("heading", { name: "Owner portal" })).toBeVisible();
  await expect(page.context().cookies()).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "betna_session", value: expect.stringMatching(/^test\./), httpOnly: true }),
  ]));
});
