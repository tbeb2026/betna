import { expect, test } from "@playwright/test";

const enabled = process.env.BETNA_CRITICAL_FLOW_E2E === "1";

test("critical inquiry-to-commission flow stays observable end to end", async ({
  page,
  request,
}) => {
  test.skip(!enabled, "requires a seeded API and role sessions");

  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
  const adminToken = process.env.BETNA_E2E_ADMIN_TOKEN;
  const ownerToken = process.env.BETNA_E2E_OWNER_TOKEN;
  const propertySlug =
    process.env.BETNA_E2E_PROPERTY_SLUG ?? "verified-kilimani-home";
  if (!adminToken || !ownerToken) {
    throw new Error(
      "BETNA_E2E_ADMIN_TOKEN and BETNA_E2E_OWNER_TOKEN are required",
    );
  }

  await expect((await request.get(`${api}/health/live`)).ok()).toBeTruthy();
  await expect((await request.get(`${api}/health/ready`)).ok()).toBeTruthy();

  await page.goto(`/en/property/${propertySlug}`);
  await expect(
    page.getByRole("heading", { name: "Ask about this place" }),
  ).toBeVisible();
  const property = await request.get(
    `${api}/public/properties/${propertySlug}`,
  );
  expect(property.ok()).toBeTruthy();
  const propertyBody = await property.json();
  const propertyId = propertyBody.id;
  const offeringId = propertyBody.offerings?.[0]?.id;
  expect(propertyId).toBeTruthy();

  const inquiryResponse = await request.post(`${api}/public/inquiries`, {
    data: {
      propertyId,
      offeringId,
      mode: "LONG_TERM",
      name: "Critical Flow Guest",
      email: `critical-${Date.now()}@example.test`,
      phone: "+254711111111",
      message: "Please confirm this place is available.",
    },
  });
  expect(inquiryResponse.ok()).toBeTruthy();
  const inquiry = await inquiryResponse.json();
  const inquiryId = inquiry.inquiry?.id ?? inquiry.id;
  expect(inquiryId).toBeTruthy();

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
  const released = await request.post(
    `${api}/admin/inquiries/${inquiryId}/location-release`,
    {
      headers: adminHeaders,
      data: { reason: "Critical flow verification" },
    },
  );
  expect(released.ok()).toBeTruthy();

  const confirmed = await request.post(
    `${api}/owner/inquiries/${inquiryId}/respond`,
    {
      headers: ownerHeaders,
      data: { decision: "CONFIRMED" },
    },
  );
  expect(confirmed.ok()).toBeTruthy();

  const conversionResponse = await request.post(`${api}/owner/conversions`, {
    headers: ownerHeaders,
    data: {
      inquiryId,
      firstPaymentAmount: "1000",
      firstPaymentCurrency: "KES",
      paymentEvidence: "critical-flow-receipt",
    },
  });
  expect(conversionResponse.ok()).toBeTruthy();
  const conversion = await conversionResponse.json();
  const conversionId = conversion.id;
  expect(conversionId).toBeTruthy();

  const verified = await request.post(
    `${api}/admin/conversions/${conversionId}/verify`,
    {
      headers: adminHeaders,
      data: {
        paymentEvidence: "staff-verified-critical-flow-receipt",
        approved: true,
      },
    },
  );
  expect(verified.ok()).toBeTruthy();
  const due = await request.post(
    `${api}/admin/conversions/${conversionId}/mark-due`,
    {
      headers: adminHeaders,
    },
  );
  expect(due.ok()).toBeTruthy();
  await expect(due.json()).resolves.toMatchObject({ status: "COMMISSION_DUE" });
});
