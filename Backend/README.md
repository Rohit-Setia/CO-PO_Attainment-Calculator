# Backend - Development Setup

Quick steps to run the backend with your local or remote MySQL instance:

1. **Ensure MySQL database exists**:
   Before running the backend, make sure you have MySQL server running and create the database (e.g. `teacher_auth`):
   ```sql
   CREATE DATABASE teacher_auth;
   ```

2. **Configure environment variables**:
   Ensure `.env` exists in the `Backend/` directory (a sample `.env` is included). Update it with your MySQL credentials:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=teacher_auth
   CLIENT_URL=http://localhost:5173
   PORT=5000
   JWT_SECRET=super_secret_key
   ```

3. **Install dependencies and start the server**:
   ```bash
   cd Backend
   npm install
   npm run dev
   ```

Notes:
- The database tables (like `teachers` for authentication) will be automatically created on server startup if they do not already exist.
