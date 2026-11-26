ALTER TABLE "Notification"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processingToken" VARCHAR(64),
  ADD COLUMN "processingAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "reference" VARCHAR(30),
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "body" TEXT;

CREATE INDEX "Notification_status_nextAttemptAt_idx"
  ON "Notification"("status", "nextAttemptAt");
