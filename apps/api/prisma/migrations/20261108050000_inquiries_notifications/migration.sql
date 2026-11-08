CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
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

ALTER TABLE "ContactClick" ADD CONSTRAINT "ContactClick_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
