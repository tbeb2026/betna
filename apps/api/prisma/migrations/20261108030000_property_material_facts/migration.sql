ALTER TABLE "Property"
  ADD COLUMN "materialFacts" JSONB NOT NULL DEFAULT '{}'::jsonb;
