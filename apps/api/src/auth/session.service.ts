import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

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
  private readonly prisma?: PrismaService;
  private readonly sessions = new Map<string, StoredSession>();

  constructor(
    prismaOrOptions: PrismaService | SessionOptions = {},
    options: SessionOptions = {},
  ) {
    if (isPrismaService(prismaOrOptions)) {
      this.prisma = prismaOrOptions;
      this.ttlMs = options.ttlMs ?? 1000 * 60 * 60 * 24 * 30;
    } else {
      this.ttlMs = prismaOrOptions.ttlMs ?? 1000 * 60 * 60 * 24 * 30;
    }
  }

  async create(
    userId: string,
    roles: string[] = [],
    territoryIds: string[] = [],
  ): Promise<Session> {
    const token = randomBytes(32).toString("base64url");
    const id = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const stored: StoredSession = {
      id,
      tokenHash: this.hash(token),
      userId,
      roles: [...roles],
      territoryIds: [...territoryIds],
      expiresAt,
    };
    if (this.prisma) {
      await this.prisma.authSession.create({
        data: {
          id,
          userId,
          tokenHash: stored.tokenHash,
          roles: stored.roles,
          territoryIds: stored.territoryIds,
          expiresAt,
        },
      });
    } else {
      this.sessions.set(stored.tokenHash, stored);
    }
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
    const stored = this.prisma
      ? await this.prisma.authSession.findUnique({ where: { tokenHash } })
      : this.sessions.get(tokenHash);
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
      roles: jsonStringArray(stored.roles),
      territoryIds: jsonStringArray(stored.territoryIds),
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
    if (this.prisma) {
      const byToken = await this.prisma.authSession.findUnique({
        where: { tokenHash: this.hash(tokenOrId) },
      });
      const session =
        byToken ??
        (await this.prisma.authSession.findUnique({
          where: { id: tokenOrId },
        }));
      if (session && !session.revokedAt) {
        await this.prisma.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
      }
      return;
    }
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

function isPrismaService(
  value: PrismaService | SessionOptions,
): value is PrismaService {
  return "authSession" in value;
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
