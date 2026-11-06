-- Durable identity state for revocation, OTP expiry/attempts, and verifier scope.
CREATE TABLE "UserTerritory" (
    "userId" UUID NOT NULL,
    "territoryId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTerritory_pkey" PRIMARY KEY ("userId", "territoryId")
);

CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "roles" JSONB NOT NULL DEFAULT '[]',
    "territoryIds" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "salt" VARCHAR(128) NOT NULL,
    "codeHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "OtpChallenge_phone_requestedAt_idx" ON "OtpChallenge"("phone", "requestedAt");
CREATE INDEX "OtpChallenge_phone_expiresAt_idx" ON "OtpChallenge"("phone", "expiresAt");
CREATE INDEX "UserTerritory_territoryId_idx" ON "UserTerritory"("territoryId");

ALTER TABLE "UserTerritory" ADD CONSTRAINT "UserTerritory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserTerritory" ADD CONSTRAINT "UserTerritory_territoryId_fkey"
  FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
