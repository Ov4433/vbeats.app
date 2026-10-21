-- Mark the seeded V Team house beat as the pinned house beat.
-- Idempotent: re-running keeps the flag set; matches the exact beat id
-- created by scripts/seed-house-beat.cjs on 2026-10-21.
UPDATE "Beat" SET "isHouse" = true WHERE id = 'cmvip1ns800065esrsrd1p2dr';
