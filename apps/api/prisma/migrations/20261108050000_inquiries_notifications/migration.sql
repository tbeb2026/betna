CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    "recipientId" UUID,
    "recipientEmail" VARCHAR(320),
    "recipientPhone" VARCHAR(40),
    "inquiryId" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

CREATE INDEX "Notification_inquiryId_createdAt_idx" ON "Notification"("inquiryId", "createdAt");
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

CREATE TABLE "ContactClick" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "target" VARCHAR(20) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactClick_propertyId_createdAt_idx" ON "ContactClick"("propertyId", "createdAt");
CREATE INDEX "ContactClick_target_channel_createdAt_idx" ON "ContactClick"("target", "channel", "createdAt");

ALTER TABLE "Inquiry" ADD COLUMN "locationReleaseExpiresAt" TIMESTAMP(3), ADD COLUMN "locationRevokedAt" TIMESTAMP(3), ADD COLUMN "locationReleasedBy" UUID;
CREATE INDEX "Inquiry_status_locationReleaseExpiresAt_idx" ON "Inquiry"("status", "locationReleaseExpiresAt");

CREATE TABLE "InquiryAbuseAttempt" (
    "id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "normalizedEmail" VARCHAR(320) NOT NULL,
    "normalizedPhone" VARCHAR(40) NOT NULL,
    "fingerprint" VARCHAR(128),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InquiryAbuseAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InquiryAbuseAttempt_key_key" ON "InquiryAbuseAttempt"("key");
CREATE INDEX "InquiryAbuseAttempt_lastAttemptAt_idx" ON "InquiryAbuseAttempt"("lastAttemptAt");
CREATE INDEX "InquiryAbuseAttempt_normalizedEmail_lastAttemptAt_idx" ON "InquiryAbuseAttempt"("normalizedEmail", "lastAttemptAt");
CREATE INDEX "InquiryAbuseAttempt_normalizedPhone_lastAttemptAt_idx" ON "InquiryAbuseAttempt"("normalizedPhone", "lastAttemptAt");
CREATE INDEX "InquiryAbuseAttempt_fingerprint_lastAttemptAt_idx" ON "InquiryAbuseAttempt"("fingerprint", "lastAttemptAt");

ALTER TABLE "ContactClick" ADD CONSTRAINT "ContactClick_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
