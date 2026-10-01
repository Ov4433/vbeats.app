# VBeats Backend

![Verified Beats Studio logo](../brand/logo.png)

REST API for the VBeats mobile app (React Native + Expo 50). Base path: `/v1`
(e.g. `https://api.vbeats.app/v1`).

Stack: Node + Express + TypeScript, Prisma ORM + PostgreSQL, Zod validation,
JWT access tokens + rotating refresh tokens, bcrypt password hashing, Multer
audio uploads with server-side SHA-256 fingerprints, and read-only on-chain
verification against the `BeatRegistry` contract (`../contracts`).

## Quick start

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL, JWT_SECRET, ...
npm install
npx prisma migrate dev        # creates the DB tables (needs PostgreSQL)
npm run seed                  # demo user + 3 demo beats
npm run dev                   # http://localhost:4000, base path /v1
```

Production build:

```bash
npm run build
npm run prisma:deploy
npm start
```

## Run with Docker

From the repo root — spins up PostgreSQL 16 plus the API (migrations run
automatically on startup):

```bash
docker compose up --build
```

API: `http://localhost:4000` (routes under `/v1`, health at `/health`).

Useful extras:

```bash
docker compose up --build -d          # run in the background
docker compose logs -f api            # follow the API logs
docker compose exec api npm run seed  # load the 3 demo beats
docker compose down                   # stop everything
docker compose down -v                # also wipe the database + uploads
```

For anything beyond local dev, set a real JWT secret (the default is a
placeholder):

```bash
JWT_SECRET=$(openssl rand -hex 48) docker compose up --build
```

## API overview

Auth (`POST /v1/auth/...`): `signup {email,password,username|name,wallet?}`,
`login`, `logout` (Bearer), `refresh {refreshToken}`, `verify` (Bearer),
plus `GET /me` for the mobile app. Responses: `{token, refreshToken, user}`.

Beats (all Bearer-auth):
- `GET /v1/beats` — paginated list
- `POST /v1/beats` — create from JSON `{title, genre, bpm, key, price, desc|description, dur|duration, audioUrl?, fingerprint?}`
- `POST /v1/beats/upload` — multipart (`audio` file + same metadata fields); computes SHA-256, stores under `uploads/`
- `GET /v1/beats/user` — your beats
- `GET /v1/beats/marketplace?search=&genre=&minPrice=&maxPrice=&page=&limit=`
- `GET /v1/beats/search?q=` (mobile-app compatibility)
- `GET|PUT|DELETE /v1/beats/:id` (PUT/DELETE are owner-only)
- `POST /v1/beats/:id/verify` — recompute fingerprint → `{verified, fingerprint, onChain}`

Beat JSON carries both field-name variants so the demo mock and the mobile
app both work: `desc`/`description`, `dur`/`duration` (seconds),
`date`/`createdAt`.

Users: `GET|PUT /v1/users/profile`, `GET /v1/users/stats` → `{beats, sales, earnings}`.

Transactions: `GET /v1/transactions`, `GET /v1/transactions/:id`.
Webhooks: `POST /v1/webhooks/stripe` (stub — logs and acknowledges).

Brand (public, no auth): `GET /v1/brand` →
`{name: "Verified Beats Studio", logo, mascot, profile, banner}` with absolute
URLs; the raw files are also served at `/brand/<file>`.

`GET /health` — liveness probe (no auth).

## Demo seed

`npm run seed` creates `demo@vbeats.app` / password `vbeats-demo-123` with the
three beats from the tappable demo ("Midnight Drive", "Neon Skyline",
"Velvet Bass"). Dev-only credentials — change them in any shared environment.

## On-chain verification

Set `RPC_URL` and `BEAT_REGISTRY_ADDRESS` in `.env` (deploy via
`../contracts`: `npx hardhat run scripts/deploy.ts --network <net>`).
Without them, `onChain` reports `false` and `chainConfigured: false`.
