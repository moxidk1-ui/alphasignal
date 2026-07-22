DROP INDEX IF EXISTS "Signal_algoDetectionId_key";
CREATE INDEX "Signal_algoDetectionId_idx" ON "Signal"("algoDetectionId");
