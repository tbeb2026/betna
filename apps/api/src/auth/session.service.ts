import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

export interface Session {
  id: string;
  token: string;
  userId: string;
  roles: string[];
  territoryIds: string[];
  expiresAt: Date;
}

export interface SessionOptions {
  ttlMs?: number;
}

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Authentication failed") {
    super(message);
    this.name = "AuthenticationError";
  }
}

type StoredSession = Omit<Session, "token"> & {
  tokenHash: string;
  revokedAt?: Date;
};

/**
 * Opaque sessions with server-side revocation. The store is deliberately kept
 * behind this service so a Redis/DB store can be substituted without changing
 * the auth boundary.
 */
@Injectable()
export class SessionService {
  private readonly ttlMs: number;
  private readonly sessions = new Map<string, StoredSession>();

  constructor(options: SessionOptions = {}) {
    this.ttlMs = options.ttlMs ?? 1000 * 60 * 60 * 24 * 30;
  }

  async create(
    userId: string,
    roles: string[] = [],
    territoryIds: string[] = [],
  ): Promise<Session> {
    const token = randomBytes(32).toString("base64url");
    const id = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + this.ttlMs);
    this.sessions.set(this.hash(token), {
      id,
      tokenHash: this.hash(token),
      userId,
      roles: [...roles],
      territoryIds: [...territoryIds],
      expiresAt,
    });
    return {
      id,
      token,
      userId,
      roles: [...roles],
      territoryIds: [...territoryIds],
      expiresAt,
    };
  }

  async validate(token: string): Promise<Session> {
    const tokenHash = this.hash(token);
    const stored = this.sessions.get(tokenHash);
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() <= Date.now()
    ) {
      throw new AuthenticationError("Session is invalid or expired");
    }
    return {
      id: stored.id,
      token,
      userId: stored.userId,
      roles: [...stored.roles],
      territoryIds: [...stored.territoryIds],
      expiresAt: stored.expiresAt,
    };
  }

  async createSession(
    userId: string,
    roles: string[] = [],
    territoryIds: string[] = [],
  ): Promise<Session> {
    return this.create(userId, roles, territoryIds);
  }

  async validateSession(token: string): Promise<Session> {
    return this.validate(token);
  }

  async revoke(tokenOrId: string): Promise<void> {
    const byToken = this.sessions.get(this.hash(tokenOrId));
    if (byToken) {
      byToken.revokedAt = new Date();
      return;
    }
    for (const session of this.sessions.values()) {
      if (session.id === tokenOrId) {
        session.revokedAt = new Date();
        return;
      }
    }
  }

  async revokeSession(tokenOrId: string): Promise<void> {
    return this.revoke(tokenOrId);
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
