# Backend - Development setup

Quick steps to run the backend with a local MySQL instance (recommended):

1. Start MySQL using Docker Compose (this uses the credentials in `.env`):

```bash
cd Backend
docker compose up -d
```

2. Ensure `.env` exists in `Backend/` (a sample `.env` is included). It contains:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=secret
DB_NAME=teacher_auth
CLIENT_URL=http://localhost:5173
PORT=5000
```

3. Install dependencies and start the server:

```bash
cd Backend
npm install
npm run dev
```

Notes:
- The server now retries table creation a few times to wait for the DB to become ready (useful when starting MySQL via Docker).
- If you prefer a system MySQL, start the service and ensure credentials match `.env`.
