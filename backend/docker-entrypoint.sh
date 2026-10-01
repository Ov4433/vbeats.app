#!/bin/sh
# Container entrypoint: apply pending Prisma migrations, then start the API.
set -e
npx prisma migrate deploy
exec node dist/index.js
