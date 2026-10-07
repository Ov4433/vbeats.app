-- CreateTable
CREATE TABLE "Play" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "listenedSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Play_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Play_beatId_idx" ON "Play"("beatId");
CREATE INDEX "Play_userId_idx" ON "Play"("userId");
CREATE INDEX "Play_createdAt_idx" ON "Play"("createdAt");

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Play" ADD CONSTRAINT "Play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
