const express = require('express');
const { body } = require('express-validator');
const { registerTeacher, loginTeacher, getTeacherProfile } = require('../controllers/authController');
const validateRequest = require('../middlewares/validateRequest');
const protect = require('../middlewares/authMiddleware');

const router = express.Router();

router.post(
  '/auth/signup',
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
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  loginTeacher,
);

router.get('/auth/dashboard', protect, getTeacherProfile);

module.exports = router;
