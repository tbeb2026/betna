import { expect, test } from "@playwright/test";

function testSessionCookie(roles: string[]) {
  const payload = Buffer.from(
    JSON.stringify({
      user: { id: "e2e-verifier", roles },
      session: { userId: "e2e-verifier", roles, territoryIds: ["territory-1"] },
    }),
  ).toString("base64url");
  return `test.${payload}`;
}

test("verifier can save an inspection draft while offline and retry upload", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "betna_session",
      value: testSessionCookie(["VERIFIER"]),
      url: "http://127.0.0.1:3100",
    },
  ]);
  await page.goto("/en/verifier/inspections/inspection-1");
  await expect(
    page.getByRole("heading", { name: "Inspection form" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/offline/i);

  await page.getByLabel("Inspection notes").fill("Visited in person");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveText(/saved/i);

  await page.getByRole("button", { name: "Submit inspection" }).click();
  await expect(page.getByRole("status")).toHaveText(/pending upload/i);
  await expect(
    page.getByRole("button", { name: "Retry upload" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByRole("status")).toHaveText(/pending upload|retry/i);
});
