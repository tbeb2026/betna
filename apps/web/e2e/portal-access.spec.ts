import { expect, test } from "@playwright/test";

function testSessionCookie(roles: string[]) {
  const payload = Buffer.from(
    JSON.stringify({
      user: { id: "e2e-user", roles },
      session: { userId: "e2e-user", roles },
    }),
  ).toString("base64url");
  return `test.${payload}`;
}

test("renders both locales left-to-right and redirects an owner away from admin", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "betna_session",
      value: testSessionCookie(["OWNER"]),
      url: "http://127.0.0.1:3100",
    },
  ]);

  await page.goto("/ti/admin");

  await expect(page).toHaveURL(/\/ti\/owner$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ti");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { name: "ፖርታል ባለቤት" }),
  ).toBeVisible();
});
