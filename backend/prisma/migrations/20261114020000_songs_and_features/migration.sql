-- Feature / co-sign requests (Nov 13): a singer asks the parent beat's
-- producer to feature their song. Accepting sets the song live;
-- declining sets it rejected. No on-chain co-sign exists — this is a
-- plain DB/API request + flag, honestly labelled in the UI.
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "parentBeatId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_parentBeatId_fkey" FOREIGN KEY ("parentBeatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FeatureRequest_producerId_status_idx" ON "FeatureRequest"("producerId", "status");
CREATE INDEX "FeatureRequest_requesterId_idx" ON "FeatureRequest"("requesterId");
CREATE INDEX "FeatureRequest_songId_status_idx" ON "FeatureRequest"("songId", "status");
