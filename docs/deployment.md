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
