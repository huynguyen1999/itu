-- Backfill one Account XP award per historical activity lifecycle.
-- This runs after the enum migration commits, avoiding PostgreSQL's
-- restriction on using a newly-added enum value in the same transaction.
WITH activity_awards AS (
  SELECT
    l.*,
    CASE
      WHEN l."entryKey" ~ ':lc[0-9]+:' THEN substring(l."entryKey" FROM ':(lc[0-9]+):')
      ELSE 'base'
    END AS lifecycle,
    s."starterKey"
  FROM "GrowthLedgerEntry" l
  LEFT JOIN "GrowthSkill" s ON s.id = l."skillId"
  WHERE l.currency = 'SKILL_XP'
    AND l.kind = 'ACTIVITY_AWARD'
    AND l.amount > 0
), grouped AS (
  SELECT
    "userId",
    "sourceType",
    "sourceId",
    lifecycle,
    COALESCE(MAX(amount) FILTER (WHERE "starterKey" = 'attribute-general'), MAX(amount)) AS amount,
    MAX("cycleId") AS "cycleId",
    MAX("titleSnapshot") AS "titleSnapshot"
  FROM activity_awards
  GROUP BY "userId", "sourceType", "sourceId", lifecycle
), prepared AS (
  SELECT
    g.*,
    ('award:' || g."sourceType" || ':' || g."sourceId" ||
      CASE WHEN g.lifecycle = 'base' THEN '' ELSE ':' || g.lifecycle END || ':account') AS "entryKey"
  FROM grouped g
  WHERE g.amount > 0
)
INSERT INTO "GrowthLedgerEntry" (
  id, "userId", currency, amount, kind, "sourceType", "sourceId", "entryKey",
  "cycleId", "titleSnapshot", metadata, "createdAt"
)
SELECT
  -- ULID-shaped deterministic id (Crockford-safe alphabet, stable on retry).
  ('0' || substr(translate(md5(p."userId" || ':' || p."entryKey"), 'abcdef', '012345'), 1, 25)),
  p."userId",
  'ACCOUNT_XP',
  p.amount,
  'ACTIVITY_AWARD',
  p."sourceType",
  p."sourceId",
  p."entryKey",
  p."cycleId",
  p."titleSnapshot",
  json_build_object('migration', 'account-xp-backfill', 'rule', 'general-or-max-skill'),
  NOW()
FROM prepared p
ON CONFLICT ("userId", "entryKey") DO NOTHING;
