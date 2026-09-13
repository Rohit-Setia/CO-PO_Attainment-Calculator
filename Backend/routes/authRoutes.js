const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const {
  registerTeacher,
  loginTeacher,
  getTeacherProfile,
  listUsers,
  updateUser,
  requestPasswordSetup,
  confirmPasswordSetup,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const validateRequest = require('../middlewares/validateRequest');
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { searchFacultyUsers } = require('../models/userModel');

const router = express.Router();

// Throttle brute-force login/signup attempts per IP; failed requests aren't skipped
// so repeated wrong-password guesses count toward the limit too.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

// Stricter throttle for the password-reset endpoints so reset emails cannot be
// requested without limit (email-bombing / token-stuffing protection). The default
// is intentionally low; PASSWORD_RESET_RATE_LIMIT lets an operator tune it per env.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.PASSWORD_RESET_RATE_LIMIT || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset attempts. Please try again in a few minutes.' },
});

router.post(
  '/auth/signup',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 3 }).withMessage('Name must be at least 3 characters'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
      .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
      .withMessage('Password must contain at least one letter and one number'),
  ],
  validateRequest,
  registerTeacher,
);

router.post(
  '/auth/login',
  authLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  loginTeacher,
);

router.get('/auth/dashboard', protect, getTeacherProfile);

// ── Password setup (bulk-import credential flow) — public endpoints ──────────
// Request endpoint is rate-limited like login to prevent email-bombing.

// POST /api/auth/password-setup/request — { email }
router.post(
  '/auth/password-setup/request',
  authLimiter,
  [body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()],
  validateRequest,
  requestPasswordSetup,
);

// POST /api/auth/password-setup/confirm — { token, password }
router.post(
  '/auth/password-setup/confirm',
  [
    body('token').trim().notEmpty().withMessage('Token is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
      .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
      .withMessage('Password must contain at least one letter and one number'),
  ],
  validateRequest,
  confirmPasswordSetup,
);

// ── HOD / Administrator self-service password reset — public endpoints ───────
// Rate-limited to prevent email-bombing. The controller enforces that ONLY Admin
// (Administrator) and Moderator (HOD) accounts are eligible; teachers and every
// other role receive a generic response and no email.

// POST /api/auth/forgot-password — { email }
router.post(
  '/auth/forgot-password',
  passwordResetLimiter,
  [body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()],
  validateRequest,
  forgotPassword,
);

// POST /api/auth/reset-password — { token, password }
router.post(
  '/auth/reset-password',
  passwordResetLimiter,
  [
    body('token').trim().notEmpty().withMessage('Token is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
      .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
      .withMessage('Password must contain at least one letter and one number'),
  ],
  validateRequest,
  resetPassword,
);

// ── Admin-only user management ───────────────────────────────────────────────

// GET /api/auth/admin/users — list all users (Admin only)
router.get('/auth/admin/users', protect, authorizeRoles('Admin'), listUsers);

// PUT /api/auth/admin/users/:id — update role and/or active status (Admin only)
router.put(
  '/auth/admin/users/:id',
  protect,
  authorizeRoles('Admin'),
  [
    body('role')
      .optional()
      .isIn(['Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin', 'Moderator'])
      .withMessage('Invalid role value'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean'),
    body('school_id').optional({ nullable: true }).isInt().withMessage('school_id must be an integer'),
    body('department_id').optional({ nullable: true }).isInt().withMessage('department_id must be an integer'),
  ],
  validateRequest,
  updateUser,
);

// GET /api/users/search?q=... — autocomplete active users/faculty for assignment
router.get('/users/search', protect, async (req, res, next) => {
  try {
    const q = req.query.q || '';
    if (!q.trim()) {
      return res.json({ success: true, data: [] });
    }
    const results = await searchFacultyUsers(q, 10);
    return res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

