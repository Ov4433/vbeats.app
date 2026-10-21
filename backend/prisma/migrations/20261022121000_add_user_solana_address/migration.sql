-- AlterTable
ALTER TABLE "User" ADD COLUMN "solanaAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_solanaAddress_key" ON "User"("solanaAddress");
