-- Money path (Nov 13): record on-chain license purchases so the producer
-- dashboard has real earnings. txHash is the Basescan receipt for a
-- BeatNFT.buy() call; licenseKind is 'lease' | 'exclusive'. No fiat, no
-- card data — crypto-native only. Partial unique index: a purchase is
-- recorded once per tx hash, but legacy rows without a hash stay valid.
ALTER TABLE "Transaction" ADD COLUMN "txHash" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "licenseKind" TEXT;
CREATE UNIQUE INDEX "Transaction_txHash_key" ON "Transaction"("txHash") WHERE "txHash" IS NOT NULL;
