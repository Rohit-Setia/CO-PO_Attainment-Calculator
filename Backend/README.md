# Backend - Development Setup

The backend is the only component that connects to MySQL — the frontend must only
call the backend API, never MySQL directly.

**Aiven MySQL is the ONLY database for this project.** There is no local/per-developer
MySQL install and no `teacher_auth` local database anymore — every developer's backend
connects to the SAME managed Aiven instance, so data (schools, teachers, students,
marks, etc.) is shared automatically. Do not create a local database or point `DB_HOST`
at `localhost`/`127.0.0.1`.

1. **Get the shared Aiven credentials**:
   Ask a teammate (never invent your own) for:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (the Aiven service + `defaultdb`)
   - the `aiven-ca.pem` CA certificate file (download from the Aiven console)

2. **Configure environment variables**:
   Copy `Backend/.env.example` to `Backend/.env` and fill in the real Aiven values:
   ```env
   DB_HOST=<the Aiven service hostname>
   DB_PORT=<the Aiven service port>
   DB_NAME=defaultdb
   DB_USER=avnadmin
   DB_PASSWORD=<the Aiven password>
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=true
   DB_SSL_CA_FILE=certs/aiven-ca.pem   # place the downloaded CA file at Backend/certs/aiven-ca.pem
   CLIENT_URL=http://localhost:5173
   PORT=5000
   JWT_SECRET=use-a-random-secret-at-least-32-characters
   ```
   Never disable `DB_SSL` or `DB_SSL_REJECT_UNAUTHORIZED` — Aiven requires TLS.
   `Backend/.env` and `Backend/certs/*.pem` are gitignored; never commit real credentials
   or the CA file.

3. **Install dependencies**:
   ```bash
   cd Backend
   npm install
   ```

4. **Start the server**:
   ```bash
   npm run dev
   ```

The existing schema bootstrap is additive and idempotent. Versioned migrations
are recorded in `schema_migrations`, and a MySQL advisory lock prevents two
backends from applying the same pending migration concurrently.

## Shared cloud setup

Developer A and Developer B each clone the repository, create their own
`Backend/.env`, and use the same `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, and `DB_SSL` values. Their frontend remains local:

`React/Vite -> local Express backend -> shared cloud MySQL`

Never put database values in `Frontend/.env` or any `VITE_DB_*` variable.

Check the connection without exposing configuration:

```text
http://localhost:5000/api/health/db
```

Expected success response:

```json
{"success":true,"database":"connected"}
```

## Backup and manual import

Create a backup before a schema change. Replace placeholders locally; do not
put passwords in shell history or documentation:

```bash
mysqldump --host=<local-or-cloud-host> --port=<port> --user=<user> --password --single-transaction --routines --triggers <database> > backup-YYYYMMDD.sql
```

Create the target database through the provider or an administrative MySQL
client, then import only after confirming the backup and target are correct:

```bash
mysql --host=<cloud-host> --port=<cloud-port> --user=<cloud-user> --password <cloud-database> < backup-YYYYMMDD.sql
```

The application does not run either command automatically. Do not use `DROP`,
`TRUNCATE`, or reset scripts for a shared database. Verify row counts and key
relationships after an approved import.

### Aiven TLS certificate

Aiven requires its CA certificate when certificate verification is enabled. In
the Aiven service console, download the service CA certificate and save it as:

```text
Backend/certs/aiven-ca.pem
```

Set `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=true`, and
`DB_SSL_CA_FILE=certs/aiven-ca.pem` in `Backend/.env`. The certificate file is
ignored by Git. Do not set `DB_SSL_REJECT_UNAUTHORIZED=false` as a workaround.
