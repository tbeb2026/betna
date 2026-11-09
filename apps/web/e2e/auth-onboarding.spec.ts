import { expect, test } from "@playwright/test";

test("sign-in exposes password, WhatsApp OTP, and owner onboarding flows", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByText("Sign in with WhatsApp code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an owner account" })).toHaveAttribute("href", "/en/sign-in/onboarding");

  await page.goto("/en/sign-in/onboarding");
  await expect(page.getByRole("heading", { name: "Create an owner account" })).toBeVisible();
  await expect(page.getByLabel("WhatsApp verification code")).toBeVisible();
  await expect(page.getByLabel(/own or am authorized/i)).toBeVisible();
});
