-- Weighted, user-owned SKILL -> ATTRIBUTE routing.  Rows are additive and
-- never replace the ledger entries that were already written.
CREATE TYPE "GrowthAttributeMappingSlot" AS ENUM ('PRIMARY', 'SECONDARY');

CREATE TABLE "GrowthAttributeMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "slot" "GrowthAttributeMappingSlot" NOT NULL,
    "weight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthAttributeMapping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GrowthAttributeMapping_weight_check" CHECK ("weight" > 0 AND "weight" <= 100),
    CONSTRAINT "GrowthAttributeMapping_slot_weight_check" CHECK (
      ("slot" = 'PRIMARY' AND "weight" BETWEEN 70 AND 100)
      OR ("slot" = 'SECONDARY' AND "weight" BETWEEN 1 AND 30)
    )
);

CREATE UNIQUE INDEX "GrowthAttributeMapping_skillId_slot_key"
  ON "GrowthAttributeMapping"("skillId", "slot");
CREATE UNIQUE INDEX "GrowthAttributeMapping_skillId_attributeId_key"
  ON "GrowthAttributeMapping"("skillId", "attributeId");
CREATE INDEX "GrowthAttributeMapping_userId_skillId_idx"
  ON "GrowthAttributeMapping"("userId", "skillId");
CREATE INDEX "GrowthAttributeMapping_userId_attributeId_idx"
  ON "GrowthAttributeMapping"("userId", "attributeId");

ALTER TABLE "GrowthAttributeMapping"
  ADD CONSTRAINT "GrowthAttributeMapping_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributeMapping"
  ADD CONSTRAINT "GrowthAttributeMapping_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "GrowthSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributeMapping"
  ADD CONSTRAINT "GrowthAttributeMapping_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "GrowthSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the cross-row invariant enforced at the database boundary.  The
-- constraint trigger is deferred so replacing a pair in one transaction is
-- valid while a lone/incomplete mapping can never be committed.
CREATE OR REPLACE FUNCTION "growth_attribute_mapping_validate"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  changed_skill TEXT := COALESCE(NEW."skillId", OLD."skillId");
  mapping_sum INTEGER;
  mapping_count INTEGER;
  skill_owner TEXT;
  attribute_owner TEXT;
  skill_kind "GrowthProgressKind";
  attribute_kind "GrowthProgressKind";
  skill_archived TIMESTAMP(3);
  attribute_archived TIMESTAMP(3);
BEGIN
  SELECT "userId", "kind", "archivedAt" INTO skill_owner, skill_kind, skill_archived FROM "GrowthSkill" WHERE "id" = changed_skill;
  IF skill_owner IS NULL OR skill_kind <> 'SKILL' OR skill_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Growth attribute mappings require a SKILL target';
  END IF;
  SELECT "userId", "kind", "archivedAt" INTO attribute_owner, attribute_kind, attribute_archived FROM "GrowthSkill" WHERE "id" = COALESCE(NEW."attributeId", OLD."attributeId");
  IF attribute_owner IS NULL OR attribute_kind <> 'ATTRIBUTE' OR attribute_archived IS NOT NULL OR attribute_owner <> skill_owner THEN
    RAISE EXCEPTION 'Growth attribute mappings require an owned ATTRIBUTE target';
  END IF;
  IF skill_owner <> COALESCE(NEW."userId", OLD."userId") THEN
    RAISE EXCEPTION 'Growth attribute mapping ownership mismatch';
  END IF;
  SELECT COUNT(*), COALESCE(SUM("weight"), 0)
    INTO mapping_count, mapping_sum
    FROM "GrowthAttributeMapping" WHERE "skillId" = changed_skill;
  IF mapping_count < 1 OR mapping_count > 2 OR mapping_sum <> 100 THEN
    RAISE EXCEPTION 'Growth attribute mapping weights must total 100%%';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "GrowthAttributeMapping_validate"
AFTER INSERT OR UPDATE OR DELETE ON "GrowthAttributeMapping"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "growth_attribute_mapping_validate"();

-- General is retired from active UI/awarding while its existing ledger remains
-- queryable and reversible.  This intentionally updates, never deletes.
UPDATE "GrowthSkill"
SET "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'ATTRIBUTE'
  AND ("starterKey" = 'attribute-general' OR LOWER("name") = 'general');

-- Deterministic 26-character Crockford ULID-compatible IDs for backfilled
-- mappings. The first character is constrained to the ULID 0..7 range.
CREATE OR REPLACE FUNCTION "growth_attribute_mapping_ulid"(seed TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  digest BYTEA := decode(md5(seed), 'hex');
  output TEXT := substr(alphabet, (get_byte(digest, 0) % 8) + 1, 1);
  position INTEGER;
  nibble INTEGER;
BEGIN
  FOR position IN 1..25 LOOP
    nibble := CASE WHEN position % 2 = 1
      THEN (get_byte(digest, position / 2) >> 4)
      ELSE (get_byte(digest, position / 2) & 15)
    END;
    output := output || substr(alphabet, nibble + 1, 1);
  END LOOP;
  RETURN output;
END;
$$;

-- Starter routes are inserted only when both sides belong to the same user.
-- ON CONFLICT keeps this backfill safe for users that already have mappings.
INSERT INTO "GrowthAttributeMapping" ("id", "userId", "skillId", "attributeId", "slot", "weight", "updatedAt")
SELECT "growth_attribute_mapping_ulid"(skill."id" || ':' || attr."id" || ':primary'), skill."userId", skill."id", attr."id", 'PRIMARY', route.weight, CURRENT_TIMESTAMP
FROM "GrowthSkill" skill
JOIN "GrowthSkill" attr ON attr."userId" = skill."userId" AND attr."kind" = 'ATTRIBUTE' AND attr."archivedAt" IS NULL
JOIN (VALUES
  ('skill-programming', 'attribute-intelligence', 'attribute-creativity', 80, 20),
  ('skill-writing', 'attribute-creativity', 'attribute-charisma', 70, 30),
  ('skill-fitness', 'attribute-strength', 'attribute-resilience', 70, 30),
  ('skill-cooking', 'attribute-dexterity', 'attribute-creativity', 70, 30),
  ('skill-language', 'attribute-intelligence', 'attribute-charisma', 70, 30)
) AS route(skill_key, primary_key, secondary_key, weight, secondary_weight)
  ON route.skill_key = skill."starterKey" AND route.primary_key = attr."starterKey"
WHERE skill."kind" = 'SKILL' AND skill."archivedAt" IS NULL
ON CONFLICT ("skillId", "slot") DO NOTHING;

INSERT INTO "GrowthAttributeMapping" ("id", "userId", "skillId", "attributeId", "slot", "weight", "updatedAt")
SELECT "growth_attribute_mapping_ulid"(skill."id" || ':' || attr."id" || ':secondary'), skill."userId", skill."id", attr."id", 'SECONDARY', route.secondary_weight, CURRENT_TIMESTAMP
FROM "GrowthSkill" skill
JOIN "GrowthSkill" attr ON attr."userId" = skill."userId" AND attr."kind" = 'ATTRIBUTE' AND attr."archivedAt" IS NULL
JOIN (VALUES
  ('skill-programming', 'attribute-intelligence', 'attribute-creativity', 80, 20),
  ('skill-writing', 'attribute-creativity', 'attribute-charisma', 70, 30),
  ('skill-fitness', 'attribute-strength', 'attribute-resilience', 70, 30),
  ('skill-cooking', 'attribute-dexterity', 'attribute-creativity', 70, 30),
  ('skill-language', 'attribute-intelligence', 'attribute-charisma', 70, 30)
) AS route(skill_key, primary_key, secondary_key, weight, secondary_weight)
  ON route.skill_key = skill."starterKey" AND route.secondary_key = attr."starterKey"
WHERE skill."kind" = 'SKILL' AND skill."archivedAt" IS NULL
ON CONFLICT ("skillId", "slot") DO NOTHING;
