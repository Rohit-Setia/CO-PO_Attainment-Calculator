# Deployment Notes

There is no CI/CD pipeline, Dockerfile, or hosting config committed to this repo. These are plain notes for deploying the two apps manually or wiring up your own pipeline — not a description of an existing automated deployment.

## Backend

1. Provision a MySQL 8 instance and create an empty database (the app creates its own tables on first boot).
2. Set environment variables (see [Backend/.env.example](../Backend/.env.example)) — `JWT_SECRET` is mandatory, the process exits immediately if it's missing.
3. Set `CLIENT_URL` to the deployed frontend's exact origin(s), comma-separated if there's more than one (e.g. a staging and a production frontend). Requests from any other origin are rejected by CORS.
4. `npm install --omit=dev && npm start` (or run under a process manager like `pm2`/`systemd` — `npm run dev` uses `nodemon` and is for local development only).
5. Put it behind HTTPS (a reverse proxy like nginx/Caddy, or your platform's TLS termination) — the app itself serves plain HTTP.

## Frontend

1. Set `VITE_API_BASE_URL` to the deployed backend's `/api` URL at build time (Vite inlines env vars into the build — this cannot be changed after `npm run build` without rebuilding).
2. `npm install && npm run build` produces a static `dist/` folder.
3. Serve `dist/` from any static host (nginx, Netlify, Vercel static hosting, S3+CDN, etc.) with SPA fallback routing (all unmatched paths → `index.html`) since this is a client-side-routed React app.

## First Admin account

There is no seed script. After deploying, sign up a user through the app, then promote it directly in MySQL:

```sql
UPDATE teachers SET role = 'Admin', is_active = TRUE WHERE email = 'your-admin@email.com';
```

From then on, further approvals can be done through the Admin Console UI.

## Things this deployment does not handle

- No automated backups — MySQL backup/restore is left to your hosting provider or your own cron+`mysqldump`.
- No blue-green/rolling deploy story — restarting the Node process drops in-flight requests.
- No horizontal scaling consideration — JWTs are stateless so multiple Node instances behind a load balancer would work, but this hasn't been tested.

---

# Phase 8 — Production Configuration

## Environment variables (Backend)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_HOST` / `DB_PORT` | yes | MySQL host and port |
| `DB_USER` / `DB_PASSWORD` | yes | MySQL credentials (least-privilege account recommended) |
| `DB_NAME` | yes | Database name (tables are created on first boot) |
| `JWT_SECRET` | yes | **At least 32 random characters** in production. The server warns at startup if it is missing or short. Rotate immediately if it was ever exposed. |
| `CLIENT_URL` | yes | Comma-separated allowlist of exact frontend origin(s). In production (`NODE_ENV=production`) ONLY this list is accepted — the localhost bypass is disabled. |
| `PORT` | no | Backend port (default 5000) |
| `NODE_ENV` | yes | `production` for production. Enables the JWT-secret warning and disables the CORS localhost bypass. |

`VITE_API_BASE_URL` (Frontend, build-time only): the deployed backend's `/api` URL. Inlined into the bundle — set before `npm run build`.

## Health check

`GET /health` (no auth) returns:

```json
{ "status": "ok" }
```

When the database is unreachable it returns HTTP 503 with `{ "status": "degraded" }`. It never exposes credentials, schema, or internals.

## CORS policy

- Development: `http://localhost:<any port>` and `http://127.0.0.1:<any port>` are accepted, plus `CLIENT_URL`.
- Production (`NODE_ENV=production`): ONLY exact `CLIENT_URL` origins. No wildcard.

## Request size

JSON body limit is 5 MB — required by the Excel import flow (client-parsed mark grids). Oversized payloads return 413.

## Rate limiting

`/auth/login` and `/auth/signup` are limited to 20 requests / 15 minutes / IP. Exceeding returns 429.

---

# Phase 8 — Database Backup & Restore

## Backup

MySQL 8 instance (database `teacher_auth`). Recommended procedure:

```bash
mysqldump --single-transaction --routines --triggers \
  -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  | gzip > "backups/teacher_auth-$(date +%Y%m%d-%H%M%S).sql.gz"
```

`--single-transaction` produces a consistent snapshot without blocking writes (InnoDB).

## Frequency

- **Daily** full dump is the minimum for an academic system whose data changes weekly (marks entry windows).
- Before any release/migration, take an extra full dump.
- Store at least one dump **off-machine** (object storage, another server) so a disk failure does not destroy the only copy.

## Retention

- Keep daily dumps for **90 days** (covers a full semester plus slack).
- Keep monthly dumps for **2 years** (accreditation cycles reference historical attainment).
- Delete older dumps automatically (e.g. `find backups -name '*.gz' -mtime +90 -delete`).

## Restore

```bash
gunzip < backups/teacher_auth-YYYYMMDD-HHMMSS.sql.gz | \
  mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
```

The app then performs its own idempotent, additive migrations on first boot after restore — no separate migration step is needed.

**Caution:** never restore over the only live database without a verified test restore first. Practice restores on a scratch database to confirm the dump is usable.

---

# Phase 8 — Deployment Checklist

1. Database backup — take a full dump before deploying.
2. Environment variables — set every variable above; `JWT_SECRET` must be a fresh random 32+ char string; `CLIENT_URL` must be the exact production frontend origin.
3. Backend installation — `npm install --omit=dev`.
4. Database migration — none to run manually; `npm start` creates/upgrades tables idempotently on first boot.
5. Backend startup — run under a process manager (`pm2` / `systemd`); verify `Server running on <PORT>`.
6. Frontend build — set `VITE_API_BASE_URL`, then `npm run build`.
7. Frontend deployment — serve `dist/` from a static host with SPA fallback (all unmatched paths → `index.html`).
8. Health check — `GET /health` returns `{"status":"ok"}`.
9. Login test — sign in with the promoted admin account.
10. Dashboard test — verify metrics load without errors.
11. Marks test — open a course's Internal Marks tab; save a mark; confirm it persists.
12. Excel test — download a marks template, edit one cell, upload, preview, save, confirm the value is visible online.
13. CO/PO test — open the attainment tab; verify values appear for courses with data.
14. Rollback procedure — stop the backend, restore the pre-deploy database dump, redeploy the previous frontend build, restart. The schema migrations are additive, so an older backend can still read a newer database; a full dump restore is the complete rollback.

