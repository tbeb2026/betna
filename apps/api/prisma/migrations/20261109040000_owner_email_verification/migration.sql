CREATE TABLE "EmailVerificationChallenge" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "salt" VARCHAR(128) NOT NULL,
    "codeHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "EmailVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerificationChallenge_email_requestedAt_idx" ON "EmailVerificationChallenge"("email", "requestedAt");
CREATE INDEX "EmailVerificationChallenge_email_expiresAt_idx" ON "EmailVerificationChallenge"("email", "expiresAt");
