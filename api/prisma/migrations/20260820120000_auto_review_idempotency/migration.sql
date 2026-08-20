CREATE UNIQUE INDEX "JournalEntry_auto_review_context_key"
  ON "JournalEntry"("userId", "contextType", "contextId")
  WHERE "contextType" = 'AUTO_GENERATED_REVIEW' AND "contextId" IS NOT NULL;
