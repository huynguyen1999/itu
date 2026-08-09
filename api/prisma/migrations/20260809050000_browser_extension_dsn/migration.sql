CREATE TABLE "BrowserExtensionCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrowserExtensionCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrowserExtensionCredential_userId_key" ON "BrowserExtensionCredential"("userId");
CREATE UNIQUE INDEX "BrowserExtensionCredential_keyHash_key" ON "BrowserExtensionCredential"("keyHash");

ALTER TABLE "BrowserExtensionCredential"
ADD CONSTRAINT "BrowserExtensionCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
