# Teacher Login & Sign-Up System (MERN-style with MySQL)

A full-stack authentication system for teachers using:
- **Frontend**: React.js, React Router, Axios, Tailwind CSS
- **Backend**: Node.js, Express.js, MySQL
- **Security**: bcrypt password hashing, JWT authentication, protected routes, request validation

## Folder Structure

```text
CT-Project/
├── Backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   └── authController.js
│   ├── middlewares/
│   │   ├── authMiddleware.js
│   │   ├── errorMiddleware.js
│   │   └── validateRequest.js
│   ├── models/
│   │   └── userModel.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── calculate.js
│   │   └── excelExport.js
│   ├── utils/
│   │   └── generateToken.js
│   ├── package.json
│   └── server.js
├── Frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── authApi.js
│   │   │   └── axiosClient.js
│   │   ├── components/auth/
│   │   │   ├── AuthLayout.jsx
│   │   │   └── ProtectedRoute.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── SignupPage.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
└── README.md
```

## Backend Setup

1. Go to backend folder:
   ```bash
   cd Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in `Backend/`:
   ```env
   PORT=5000
   CLIENT_URL=http://localhost:5173
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=teacher_auth
   JWT_SECRET=super_secret_key
   ```
4. Ensure MySQL database exists:
   ```sql
   CREATE DATABASE teacher_auth;
   ```
5. Run backend:
   ```bash
   npm run dev
   ```

The `teachers` table is auto-created on server startup.

## Frontend Setup

1. Go to frontend folder:
   ```bash
   cd Frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file in `Frontend/`:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```
4. Run frontend:
   ```bash
   npm run dev
   ```

## API Endpoints

- `POST /api/auth/signup` → Register teacher
- `POST /api/auth/login` → Login teacher
- `GET /api/auth/dashboard` → Protected profile route (requires `Bearer <token>`)

## Features Implemented

- Teacher registration with validation (`name`, `email`, strong password)
- Password hashing with `bcryptjs`
- JWT authentication and token verification middleware
- Protected dashboard route
- Logout by clearing local token and user session
- Proper API and validation error handling
- MVC backend architecture
- Responsive Tailwind-based auth screens

## Notes

If your environment blocks package installation, update dependencies manually and run `npm install` in a network-enabled environment.
