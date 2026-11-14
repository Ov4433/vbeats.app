-- Make-a-song (Nov 13): Beat.kind ('beat' | 'song', default 'beat'),
-- parentBeatId self-relation, and coSignStatus ('live' | 'pending' |
-- 'rejected', default 'live'). A song over someone else's beat starts
-- 'pending' and stays out of the public feed until the parent beat's
-- producer approves it (POST /v1/beats/:id/co-sign). No on-chain co-sign
-- exists — this is a plain DB/API pending flag, honestly labelled.
ALTER TABLE "Beat" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'beat';
ALTER TABLE "Beat" ADD COLUMN "parentBeatId" TEXT;
ALTER TABLE "Beat" ADD COLUMN "coSignStatus" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "Beat" ADD COLUMN "coSignedAt" TIMESTAMP(3);

ALTER TABLE "Beat" ADD CONSTRAINT "Beat_parentBeatId_fkey" FOREIGN KEY ("parentBeatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Beat_parentBeatId_idx" ON "Beat"("parentBeatId");
CREATE INDEX "Beat_kind_coSignStatus_idx" ON "Beat"("kind", "coSignStatus");
