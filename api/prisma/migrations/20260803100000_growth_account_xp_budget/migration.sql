-- Persist the fixed Account XP budget independently from per-skill weights.
ALTER TABLE "GrowthEarningRule" ADD COLUMN "accountXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GrowthRewardPresetSetting" ADD COLUMN "accountXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GrowthTaskRewardDefault" ADD COLUMN "accountXp" INTEGER NOT NULL DEFAULT 0;

-- Preserve legacy behavior for rows created before the explicit budget existed.
UPDATE "GrowthEarningRule" rule
SET "accountXp" = COALESCE((
  SELECT MAX(skill."xpReward")
  FROM "GrowthEarningRuleSkill" skill
  WHERE skill."ruleId" = rule.id
), 0)
WHERE rule."accountXp" = 0;

UPDATE "GrowthRewardPresetSetting"
SET "accountXp" = "xpRewardPerSkill"
WHERE "accountXp" = 0;

UPDATE "GrowthTaskRewardDefault" defaults
SET "accountXp" = COALESCE((
  SELECT MAX(skill."xpReward")
  FROM "GrowthTaskRewardDefaultSkill" skill
  WHERE skill."defaultId" = defaults.id
), 0)
WHERE defaults."accountXp" = 0;
