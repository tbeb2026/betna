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

test("owner can open a submission form with taxonomy, private address, and both rental modes", async ({
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

  await page.goto("/en/owner/properties/new");

  await expect(
    page.getByRole("heading", { name: "List a place" }),
  ).toBeVisible();
  await expect(page.getByLabel("Property title")).toBeVisible();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
    "residential",
  );
  await expect(page.getByLabel("Subcategory")).toBeVisible();
  await page.getByLabel("Category", { exact: true }).selectOption("land");
  await expect(page.getByLabel("Subcategory")).toHaveValue("land");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("residential");
  await expect(page.getByLabel("Subcategory")).toHaveValue("apartment");
  await expect(page.getByLabel("City")).toHaveValue("city-ke-nairobi");
  await expect(page.getByLabel("Public area or neighborhood")).toBeVisible();
  await expect(page.getByLabel("Approximate latitude")).toHaveValue("-1.2921");
  await expect(page.getByLabel("Approximate longitude")).toHaveValue("36.7875");
  await expect(page.getByLabel("Exact latitude (private)")).toHaveValue(
    "-1.2901",
  );
  await expect(page.getByLabel("Exact longitude (private)")).toHaveValue(
    "36.7895",
  );
  await expect(page.getByLabel("Exact address (private)")).toBeVisible();
  await expect(page.getByLabel("Short-stay public price (KES)")).toBeVisible();
  await expect(page.getByLabel("Long-term public price (KES)")).toBeVisible();
  await expect(
    page.getByLabel("I confirm that I own or am authorized to list this place"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeVisible();
});

test("owner portfolio and draft edit routes use the owner data boundary", async ({
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

  await page.goto("/en/owner/properties");
  await expect(
    page.getByRole("heading", { name: "Your places" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "List a place" })).toBeVisible();

  await page.goto("/en/owner/properties/property-1/edit");
  await expect(
    page.getByRole("heading", { name: "Edit your draft" }),
  ).toBeVisible();
  await expect(page.getByLabel("City")).toHaveValue("city-ke-nairobi");
});
