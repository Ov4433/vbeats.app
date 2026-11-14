-- Escrow fee route (Nov 13, Star: "5% is the fee"): registry so the buy
-- panel can find the active BeatEscrow listing for a beat (escrow has no
-- fingerprint lookup), plus channel + feeEth on Transaction so the
-- dashboard can show gross / fee / net. No live DB here — written, not
-- run; deploy with `npx prisma migrate deploy`.
CREATE TABLE "EscrowListing" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "priceWei" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EscrowListing_listingId_key" ON "EscrowListing"("listingId");
CREATE INDEX "EscrowListing_beatId_active_idx" ON "EscrowListing"("beatId", "active");
ALTER TABLE "EscrowListing" ADD CONSTRAINT "EscrowListing_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- channel: 'direct' (legacy BeatNFT.buy, 0% fee) | 'escrow' (BeatEscrow
-- settle, 5% fee taken on-chain). NULL on old rows = direct.
-- feeEth: the 5% platform fee in ETH on escrow sales; 0 / NULL on direct.
ALTER TABLE "Transaction" ADD COLUMN "channel" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "feeEth" DOUBLE PRECISION;
