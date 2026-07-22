CREATE TYPE "SignalOutcomeSource" AS ENUM ('MARKET_DATA', 'PROVIDER_REPORTED', 'ADMIN_OVERRIDE');

ALTER TABLE "Signal"
ADD COLUMN "outcomeSource" "SignalOutcomeSource",
ADD COLUMN "outcomePrice" DOUBLE PRECISION,
ADD COLUMN "outcomeObservedAt" TIMESTAMP(3);

UPDATE "Signal"
SET
  "outcomeSource" = 'PROVIDER_REPORTED',
  "outcomeObservedAt" = COALESCE("closedAt", "updatedAt")
WHERE "status" = 'CLOSED' AND "outcomeSource" IS NULL;

CREATE INDEX "Signal_status_outcomeSource_idx" ON "Signal"("status", "outcomeSource");
