import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "./api-client";
import { getRoleRedirectPath, type Locale } from "../i18n/routing";

export type PortalRole = "OWNER" | "VERIFIER" | "ADMIN";
export type Session = {
  userId: string;
  roles: string[];
  territoryIds?: string[];
  token?: string;
};

function normalizeSession(input: any, token: string): Session | null {
  const source = input?.session ?? input;
  const user = input?.user;
  const roles = user?.roles ?? source?.roles;
  if (!source?.userId && !user?.id) return null;
  if (!Array.isArray(roles)) return null;
  return {
    userId: String(source.userId ?? user.id),
    roles: roles.map(String).map((role: string) => role.toUpperCase()),
    territoryIds: Array.isArray(source.territoryIds) ? source.territoryIds.map(String) : [],
    token,
  };
}

function decodeTestSession(token: string): Session | null {
  if (process.env.BETNA_TEST_AUTH !== "1" || !token.startsWith("test.")) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.slice(5), "base64url").toString("utf8"));
    return normalizeSession(payload, token);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get("betna_session")?.value;
  if (!token) return null;
  const testSession = decodeTestSession(token);
  if (testSession) return testSession;

  try {
    const response = await createApiClient({
      token,
      baseUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL,
    }).get<unknown>("/auth/session");
    return normalizeSession(response, token);
  } catch {
    return null;
  }
}

export async function requireRole(role: PortalRole, locale: Locale | string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.roles.includes(role)) {
    const actual = session.roles.find((candidate) => ["OWNER", "VERIFIER", "ADMIN"].includes(candidate));
    redirect(actual ? getRoleRedirectPath(actual, role, locale) : `/${locale}/sign-in`);
  }
  return session;
}
