# Architecture

## Stack

- **Frontend**: React 19 + Vite, React Router 7, Tailwind CSS 3 (CSS-variable design tokens, class-based dark mode), shadcn/ui-style primitives on Radix UI, Framer Motion, Recharts, `sonner` toasts, `xlsx` (SheetJS) for Excel parsing, Axios.
- **Backend**: Node.js + Express 5, `mysql2/promise` (connection pool, parameterized queries), `jsonwebtoken`, `bcryptjs`, `express-validator`, `express-rate-limit`, `helmet`, `exceljs` (Excel generation).
- **Database**: MySQL 8. Schema is created/migrated by application code at startup (`models/*.js`), not a separate migration tool — see [database.md](database.md).

## Request flow

```
Browser (React SPA, Vite dev server / static build)
      │  axios, Bearer JWT in Authorization header
      ▼
Express API (server.js)
      │  helmet → CORS allowlist → express.json() → routes
      ▼
routes/*.js
      │  protect (JWT verify) → authorizeRoles / checkCoursePermission (RBAC)
      ▼
controllers / inline route handlers
      │
      ▼
models/*.js  →  mysql2 pool  →  MySQL
```

There is no server-side rendering, no separate API gateway, and no background job queue — every request is synchronous request/response.

## Authentication & session

- JWT-based, stateless. `generateToken()` signs `{id, email, role}` with a 1-day expiry; the token is never persisted server-side (no session table, no refresh token).
- The frontend stores the token in `localStorage` (`teacher_token`) and attaches it via an axios request interceptor (`src/Api/axiosClient.js`).
- A response interceptor catches `401` responses, clears `localStorage`, and redirects to `/login` — so an expired/invalid token forces a clean logout instead of surfacing as a generic error.
- `AuthContext` (`src/context/AuthContext.jsx`) exposes `isAuthenticated`, `user`, `hasRole(...roles)`, `login()`, `logout()`. `ProtectedRoute` gates every non-public route on `isAuthenticated`, and optionally on `allowedRoles`.

## Authorization (RBAC)

Two layers, both enforced **server-side** (frontend hiding a button is never the only gate):

1. **Role-level** — `authorizeRoles(...roles)` middleware checks `req.user.role` against an allowlist. Used for role-wide actions like creating a course or listing all users.
2. **Resource-level** — `checkCoursePermission(requiredAssignedRoles)` middleware checks whether the requesting user owns the course (`courses.teacher_id`) or has an entry in `user_course_assignments` with a sufficient `assigned_role`. Admin and Examination Team bypass this check entirely (see [database.md](database.md) and the RBAC table in the root [README](../README.md)).

Every `/api/courses/:id/...` route uses both `protect` and `checkCoursePermission` consistently — this was audited and made consistent across all routes (the Excel export route previously lacked resource-level checks; that's fixed).

## Theming

Design tokens (`--background`, `--foreground`, `--card`, `--primary`, `--border`, `--success`, `--warning`, etc.) are defined as HSL CSS custom properties in `src/index.css`, mapped into Tailwind's color palette in `tailwind.config.js`, and consumed by every component via `bg-*`/`text-*`/`border-*` utility classes — never hardcoded hex/slate values in redesigned components. `ThemeContext` toggles a `.dark` class on `<html>` and persists the choice to `localStorage`; the dark palette is tuned to match the app's original slate/indigo look rather than shadcn's generic default.

## Known architectural limitations

- `co_po_mappings` and `course_configs` are fixed-width tables (hardcoded CO1–6 × PO1–12 × PSO1–3 columns), not normalized. Fine for the current fixed scope; would need redesigning to support a variable PO/PSO count per program.
- No caching layer (React Query/SWR) on the frontend — every tab switch in the Course Workspace re-fetches from the API that was already fetched once at page load, via local state, not a fresh network call, but there's no request de-duplication or background revalidation.
- Single JS bundle (~1.4MB before gzip) — no route-based code splitting yet.
