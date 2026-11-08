import { NextResponse } from "next/server";

const timeoutMs = 2_000;

function apiHealthUrl(): string {
  const base =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return `${base.replace(/\/$/, "")}/health/ready`;
}

export async function GET(): Promise<NextResponse> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const response = await fetch(apiHealthUrl(), {
      cache: "no-store",
      signal: abort.signal,
      headers: { Accept: "application/json" },
    });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
    };
    if (!response.ok) throw new Error(`API health returned ${response.status}`);

    return NextResponse.json({
      status: "ok",
      service: "web",
      timestamp: new Date().toISOString(),
      dependencies: { api: body.status ?? "ok" },
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "web",
        timestamp: new Date().toISOString(),
        dependencies: { api: "down" },
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
