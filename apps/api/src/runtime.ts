import { isIP } from "node:net";

export type ApiRuntimeEnvironment = {
  [key: string]: string | undefined;
  API_PORT?: string;
  PORT?: string;
  API_CORS_ORIGINS?: string;
  PUBLIC_API_URL?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  SESSION_SECRET?: string;
  JWT_SECRET?: string;
  MEDIA_SIGNING_SECRET?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  WHATSAPP_PROVIDER?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_PUBLIC_BUCKET?: string;
  S3_PRIVATE_BUCKET?: string;
  MEDIA_STORAGE_PROVIDER?: string;
};

export const API_CORS_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "OPTIONS",
] as const;

const productionRequiredEnvironment = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "JWT_SECRET",
  "MEDIA_SIGNING_SECRET",
  "API_CORS_ORIGINS",
  "PUBLIC_API_URL",
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "WHATSAPP_PROVIDER",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_BUCKET",
  "S3_PRIVATE_BUCKET",
  "MEDIA_STORAGE_PROVIDER",
] as const;
const productionSecretEnvironment = new Set([
  "SESSION_SECRET",
  "JWT_SECRET",
  "MEDIA_SIGNING_SECRET",
]);

/** Fail before Nest boots when production would start without its trust boundaries. */
export function validateRuntimeEnvironment(
  environment: ApiRuntimeEnvironment = process.env,
): void {
  if (environment.NODE_ENV !== "production") return;

  const missing: string[] = productionRequiredEnvironment.filter((key) => {
    const value = environment[key]?.trim();
    return (
      !value ||
      (productionSecretEnvironment.has(key) && value.length < 16) ||
      value.includes("replace-with")
    );
  });
  if (missing.length) {
    throw new Error(
      `Missing or unsafe production environment variables: ${missing.join(", ")}`,
    );
  }
  getPublicApiOrigin(environment);
  const emailProvider = environment.EMAIL_PROVIDER?.trim().toLowerCase();
  if (emailProvider === "resend" && !environment.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (emailProvider !== "resend") throw new Error("EMAIL_PROVIDER must be resend in production");
  const whatsappProvider = environment.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (whatsappProvider === "meta" && (!environment.WHATSAPP_ACCESS_TOKEN?.trim() || !environment.WHATSAPP_PHONE_NUMBER_ID?.trim())) {
    missing.push("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  }
  if (whatsappProvider !== "meta") throw new Error("WHATSAPP_PROVIDER must be meta in production");
  const storageProvider = environment.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase();
  if (storageProvider !== "s3" && storageProvider !== "minio") throw new Error("MEDIA_STORAGE_PROVIDER must be s3 or minio in production");
  if (missing.length) throw new Error(`Missing or unsafe production environment variables: ${[...new Set(missing)].join(", ")}`);
}

/** Resolve the public API origin used in visitor-facing redemption URLs. */
export function getPublicApiOrigin(
  environment: ApiRuntimeEnvironment = process.env,
): string {
  const configured = environment.PUBLIC_API_URL?.trim();
  const isDevelopment = environment.NODE_ENV === "development";
  const value = configured || (isDevelopment ? "http://localhost:4000" : undefined);
  if (!value) throw new Error("PUBLIC_API_URL is required outside development");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid PUBLIC_API_URL: ${value}`);
  }
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !["http:", "https:"].includes(parsed.protocol)
  ) {
    throw new Error("PUBLIC_API_URL must be an HTTP(S) origin without a path");
  }
  if (!isDevelopment && parsed.protocol !== "https:") {
    throw new Error("PUBLIC_API_URL must use HTTPS outside development");
  }
  if (!isDevelopment && isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      "PUBLIC_API_URL must not use localhost or a loopback address outside development",
    );
  }
  return parsed.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ip = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
  if (isIP(ip) === 4) return ip.startsWith("127.");
  return isIP(ip) === 6 && ip === "::1";
}

/** Resolve the API listener from the documented API_PORT, defaulting to 4000. */
export function getApiPort(
  environment: ApiRuntimeEnvironment = process.env,
): number {
  const value = environment.API_PORT ?? environment.PORT ?? "4000";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid API port: ${value}`);
  }
  return port;
}

/** Resolve browser origins permitted to call the API with credentials. */
export function getApiCorsOrigins(
  environment: ApiRuntimeEnvironment = process.env,
): string[] {
  const configured = environment.API_CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured?.length) {
    const origins = configured.map((origin) => {
      if (origin === "*") {
        throw new Error(
          "Wildcard CORS origins are not allowed with credentials",
        );
      }
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
      if (
        parsed.origin !== origin ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
      if (
        environment.NODE_ENV === "production" &&
        parsed.protocol !== "https:"
      ) {
        throw new Error("Production CORS origins must use HTTPS");
      }
      if (!parsed.hostname) throw new Error(`Invalid CORS origin: ${origin}`);
      return parsed.origin;
    });
    return [...new Set(origins)];
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("API_CORS_ORIGINS is required in production");
  }
  return [
    "http://localhost:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3100",
  ];
}
