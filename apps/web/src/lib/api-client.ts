export type ApiClientOptions = {
  baseUrl?: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
};

export type ApiEnvironment = {
  [key: string]: string | undefined;
  API_INTERNAL_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  NODE_ENV?: string;
};

export function getApiBaseUrl(environment: ApiEnvironment = process.env) {
  const internal = environment.API_INTERNAL_URL?.trim();
  const publicUrl = environment.NEXT_PUBLIC_API_URL?.trim();
  const configured = internal || publicUrl;
  if (!configured) {
    if (environment.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_API_URL is required in production");
    }
    return "http://localhost:4000";
  }
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("API URL must be an absolute URL");
  }
  if (
    environment.NODE_ENV === "production" &&
    !internal &&
    parsed.protocol !== "https:"
  ) {
    throw new Error("NEXT_PUBLIC_API_URL must use HTTPS in production");
  }
  if (parsed.search || parsed.hash)
    throw new Error("API URL must not contain a query or fragment");
  return parsed.toString().replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = getApiBaseUrl({
      API_INTERNAL_URL: options.baseUrl,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NODE_ENV: process.env.NODE_ENV,
    });
    this.token = options.token;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const response = await this.fetcher(
      `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
      {
        ...init,
        headers,
      },
    );
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const message =
        typeof body === "object" && body && "message" in body
          ? String(body.message)
          : `API request failed (${response.status})`;
      throw new ApiError(message, response.status, body);
    }
    return body as T;
  }

  get<T>(path: string, init?: RequestInit) {
    return this.request<T>(path, { ...init, method: "GET" });
  }

  post<T>(path: string, body: unknown, init?: RequestInit) {
    return this.request<T>(path, {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown, init?: RequestInit) {
    return this.request<T>(path, {
      ...init,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
}

export function createApiClient(options?: ApiClientOptions) {
  return new ApiClient(options);
}
