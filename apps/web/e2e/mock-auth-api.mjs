/* global Buffer, URL, fetch, process */

import http from "node:http";

const port = Number(process.env.MOCK_API_PORT ?? 4400);
const upstream = process.env.BETNA_E2E_UPSTREAM_API ?? "http://127.0.0.1:4000";
let activationAttempts = 0;

function testSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    user: { id: "owner-e2e", roles: ["OWNER"] },
    session: { userId: "owner-e2e", roles: ["OWNER"] },
  })).toString("base64url");
  return `test.${payload}`;
}

const ownerDraft = {
  id: "property-1",
  status: "DRAFT",
  title: "E2E draft",
  category: "residential",
  subcategory: "apartment",
  cityId: "city-ke-nairobi",
  publicArea: "Kilimani",
  approximateLatitude: -1.2921,
  approximateLongitude: 36.7875,
  exactLatitude: -1.2901,
  exactLongitude: 36.7895,
  exactAddress: "E2E private address",
  shortStayPrice: 10000,
  longTermPrice: 120000,
};

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname === "/health/live") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/owner/phone-otp/request") {
    await readBody(request);
    json(response, 200, { expiresAt: new Date(Date.now() + 300_000).toISOString() });
    return;
  }
  if (request.method === "POST" && url.pathname === "/auth/owner/email-verification/request") {
    await readBody(request);
    json(response, 200, { expiresAt: new Date(Date.now() + 600_000).toISOString() });
    return;
  }
  if (request.method === "POST" && url.pathname === "/auth/owner/onboarding") {
    const body = await readBody(request);
    activationAttempts += 1;
    if (body.authorizationAttested !== true) {
      json(response, 400, { message: "Owner authorization attestation is required" });
      return;
    }
    if (body.emailVerificationCode !== "654321") {
      json(response, 400, { message: "Email verification code is invalid or expired" });
      return;
    }
    json(response, 201, {
      user: { id: "owner-e2e", roles: ["OWNER"] },
      session: { token: testSessionToken() },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/owner/properties") {
    json(response, 200, [ownerDraft]);
    return;
  }
  if (request.method === "GET" && url.pathname === "/owner/properties/property-1") {
    json(response, 200, ownerDraft);
    return;
  }
  if (request.method === "GET" && url.pathname === "/owner/properties/taxonomy") {
    json(response, 200, [
      { category: "residential", label: "Residential", subcategories: [{ value: "apartment", label: "Apartment" }] },
      { category: "land", label: "Land", subcategories: [{ value: "land", label: "Land" }] },
    ]);
    return;
  }
  if (request.method === "GET" && url.pathname === "/owner/properties/geography") {
    json(response, 200, [{ code: "KE", cities: [{ id: "city-ke-nairobi", name: "Nairobi", slug: "nairobi" }] }]);
    return;
  }
  if (request.method === "POST" && url.pathname === "/media/upload-target") {
    json(response, 200, {
      mediaId: "media-e2e",
      uploadUrl: "http://storage.local/upload/media-e2e",
      headers: { "Content-Type": "image/jpeg" },
      maxBytes: 10 * 1024 * 1024,
    });
    return;
  }
  if (request.method === "POST" && /^\/media\/[^/]+\/complete$/.test(url.pathname)) {
    json(response, 200, { mediaId: url.pathname.split("/")[2], status: "CLEAN" });
    return;
  }

  try {
    const body = ["GET", "HEAD"].includes(request.method ?? "GET") ? undefined : await readBody(request);
    const proxyResponse = await fetch(`${upstream}${url.pathname}${url.search}`, {
      method: request.method,
      headers: { "content-type": request.headers["content-type"] ?? "", accept: request.headers.accept ?? "*/*" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    response.writeHead(proxyResponse.status, { "content-type": proxyResponse.headers.get("content-type") ?? "application/json" });
    response.end(Buffer.from(await proxyResponse.arrayBuffer()));
  } catch (error) {
    json(response, 502, { message: error instanceof Error ? error.message : "Upstream API unavailable" });
  }
});

server.listen(port, "127.0.0.1");
process.once("SIGTERM", () => server.close(() => process.exit(0)));
process.once("SIGINT", () => server.close(() => process.exit(0)));
