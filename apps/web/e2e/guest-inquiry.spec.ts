import { expect, test } from "@playwright/test";

test("shows account-free inquiry and prefilled contact actions on a public property", async ({ page }) => {
  await page.goto("/en/property/verified-kilimani-home");

  await expect(page.getByRole("heading", { name: "Ask about this place" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByTestId("contact-betna-whatsapp")).toHaveAttribute("href", /wa\.me/);
  await expect(page.getByTestId("contact-betna-whatsapp")).toHaveAttribute("href", /text=/);

  await page.getByLabel("Name").fill("Amina Guest");
  await page.getByLabel("Email").fill("amina@example.com");
  await page.getByLabel("Phone or WhatsApp").fill("+254711111111");
  await page.getByLabel("Message").fill("Can I visit this weekend?");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("status")).toContainText(/business hours|Reference/i);
});
