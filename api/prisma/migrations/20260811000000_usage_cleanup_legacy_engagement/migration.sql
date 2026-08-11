-- Remove legacy usage rows created before engagement tracking existed.
DELETE FROM "UsageSummary"
WHERE "engagedSeconds" IS NULL;
