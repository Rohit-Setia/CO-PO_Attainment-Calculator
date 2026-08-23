const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const {
  registerTeacher,
  loginTeacher,
  getTeacherProfile,
  listUsers,
  updateUser,
} = require('../controllers/authController');
const validateRequest = require('../middlewares/validateRequest');
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

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
      .isIn(['Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin'])
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

module.exports = router;

