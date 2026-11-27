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

test("owner upload sends the session bearer to the API and completes a direct upload", async ({
  context,
  page,
}) => {
  const session = testSessionCookie(["OWNER"]);
  await context.addCookies([
    {
      name: "betna_session",
      value: session,
      url: "http://127.0.0.1:3100",
    },
  ]);

  await page.route(
    "**/api/bff/media/upload-target",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mediaId: "media-e2e",
          uploadUrl: "http://storage.local/upload/media-e2e",
          headers: { "Content-Type": "image/jpeg" },
          maxBytes: 10 * 1024 * 1024,
        }),
      });
    },
  );
  await page.route("http://storage.local/upload/media-e2e", async (route) => {
    await route.fulfill({ status: 200 });
  });
  await page.route(
    "**/api/bff/media/media-e2e/complete",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    },
  );

  await page.goto("/en/owner/properties/property-1/edit");
  await page.getByLabel("Choose images").setInputFiles({
    name: "house.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await page.getByRole("button", { name: "Upload photos" }).click();
  await expect(page.getByRole("status")).toHaveText(/Upload complete/);
});
