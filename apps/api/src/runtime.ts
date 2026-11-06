export type ApiRuntimeEnvironment = {
  API_PORT?: string;
  PORT?: string;
};

/** Resolve the API listener from the documented API_PORT, defaulting to 4000. */
export function getApiPort(environment: ApiRuntimeEnvironment = process.env): number {
  const value = environment.API_PORT ?? environment.PORT ?? "4000";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid API port: ${value}`);
  }
  return port;
}
