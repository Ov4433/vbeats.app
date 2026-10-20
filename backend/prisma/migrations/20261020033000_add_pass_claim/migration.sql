-- CreateTable
CREATE TABLE "PassClaim" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "bat" TEXT NOT NULL,
    "memberNumber" INTEGER NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PassClaim_walletAddress_key" ON "PassClaim"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PassClaim_memberNumber_key" ON "PassClaim"("memberNumber");

-- CreateIndex
CREATE INDEX "PassClaim_createdAt_idx" ON "PassClaim"("createdAt");
