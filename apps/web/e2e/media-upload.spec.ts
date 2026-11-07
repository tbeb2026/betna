import { expect, test } from "@playwright/test";

function testSessionCookie(roles: string[]) {
  const payload = Buffer.from(
    JSON.stringify({
      user: { id: "e2e-owner", roles },
      session: { userId: "e2e-owner", roles },
    }),
  ).toString("base64url");
  return `test.${payload}`;
}

test("owner sees a validated direct-to-storage media uploader on a draft", async ({
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

  await page.goto("/en/owner/properties/property-1/edit");
  await expect(
    page.getByRole("heading", { name: "Property photos" }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose images")).toHaveAttribute(
    "accept",
    /image\/jpeg/,
  );
  await expect(
    page.getByRole("button", { name: "Upload photos" }),
  ).toBeDisabled();
});
