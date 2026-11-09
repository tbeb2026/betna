-- A media object can belong to at most one inspection evidence record.
CREATE UNIQUE INDEX "InspectionEvidence_mediaId_key"
ON "InspectionEvidence"("mediaId");
