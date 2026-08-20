CREATE TYPE "BrowserExtensionCredentialKind" AS ENUM ('DEFAULT_BROWSER', 'SAFARI_IOS');

ALTER TABLE "BrowserExtensionCredential"
ADD COLUMN "kind" "BrowserExtensionCredentialKind" NOT NULL DEFAULT 'DEFAULT_BROWSER';

DROP INDEX "BrowserExtensionCredential_userId_key";

CREATE UNIQUE INDEX "BrowserExtensionCredential_userId_kind_key"
ON "BrowserExtensionCredential"("userId", "kind");
