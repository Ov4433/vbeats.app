# Deploy the VBeats API for free (Render + Neon)

**Free-domain reality check:** `vbeats.app` can never be free — `.app` is a
paid TLD (~$15–20/yr). This setup gives you a free public API at

```
https://vbeats-api.onrender.com
```

(adjust the name if you pick a different Render service name).

**Cost: $0.** Caveats of the free tier, stated plainly:

- The API **sleeps after ~15 minutes idle**; the first request after that
  takes ~30 seconds to wake it. Fine for testing, not for launch.
- **Uploads are ephemeral** — files are wiped when the service restarts.
  Fine for testing; production needs object storage (S3/R2).
- Render's own free Postgres expires, which is why the database lives on
  **Neon** (free tier, no expiry).

## 1. Free Postgres (Neon) — ~5 min

1. Sign up at [neon.tech](https://neon.tech) (free, no credit card).
2. Create a project and database.
3. Copy the **connection string** (it starts with `postgresql://`).

## 2. Deploy the API (Render) — ~10 min

1. Sign up at [render.com](https://render.com) with GitHub (free, no card).
2. Dashboard → **New → Blueprint**, select the `Ov4433/vbeats.app` repo.
3. Render reads `render.yaml` from the repo. Fill in:
   - `DATABASE_URL` → your Neon connection string
   - `JWT_SECRET` → auto-generated, leave it
   - `STRIPE_*`, `RPC_URL`, `BEAT_REGISTRY_ADDRESS` → leave blank for now
4. Deploy. Prisma migrations run automatically on startup.

## 3. Verify

```bash
curl https://vbeats-api.onrender.com/health
# → {"status":"ok", ...}
```

Then sign up, log in, and upload a beat from the app pointed at the URL.

## 4. Point the app at it

Set in the `eas.json` production profile env (and your local `.env` for
dev builds):

```
EXPO_PUBLIC_API_URL=https://vbeats-api.onrender.com
```

This also satisfies the release-readiness check, which requires a
non-localhost production API URL.

## 5. Keep it awake (optional)

A free [UptimeRobot](https://uptimerobot.com) or
[cron-job.org](https://cron-job.org) monitor pinging `/health` every
10 minutes keeps the free service from sleeping.

## Going further

- **Custom domain:** buy `vbeats.app`, then add it in Render → Settings →
  Custom Domains (free SSL included).
- **Real payments:** add live Stripe keys as `STRIPE_SECRET_KEY` /
  `STRIPE_WEBHOOK_SECRET` in the Render dashboard (never in chat or git).
- **On-chain verification:** add `RPC_URL` + `BEAT_REGISTRY_ADDRESS`.
- **Always-on:** Render Starter ($7/mo) removes the sleep; or move the DB
  to Render when you're ready to pay for Postgres.
