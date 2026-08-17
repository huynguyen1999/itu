ALTER TABLE "HealthSummary"
ALTER COLUMN "standHours" TYPE DOUBLE PRECISION
USING "standHours"::double precision;
