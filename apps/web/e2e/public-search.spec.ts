import { expect, test } from "@playwright/test";

test("public search exposes filters and protected-location copy", async ({ page }) => {
  await page.goto("/en/search");

  await expect(page.getByRole("heading", { name: "Find a verified place" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Property filters" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Rental mode" })).toBeVisible();
  await expect(page.getByText("Exact addresses remain protected until managed release.")).toBeVisible();

  await page.getByLabel("City").fill("nairobi");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/\/en\/search\?.*city=nairobi/);

});

test("localized not-found pages retain the requested document locale", async ({ page }) => {
  await page.goto("/ti/property/unknown-home");
  await expect(page.locator("html")).toHaveAttribute("lang", "ti");
});
