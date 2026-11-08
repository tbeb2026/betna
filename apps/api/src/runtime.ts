export type ApiRuntimeEnvironment = {
  [key: string]: string | undefined;
  API_PORT?: string;
  PORT?: string;
  API_CORS_ORIGINS?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  SESSION_SECRET?: string;
  JWT_SECRET?: string;
  MEDIA_SIGNING_SECRET?: string;
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

  const missing = productionRequiredEnvironment.filter((key) => {
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
