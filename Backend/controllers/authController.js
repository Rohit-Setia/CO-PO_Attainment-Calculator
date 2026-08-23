const bcrypt = require('bcryptjs');
const {
  findUserByEmail,
  createUser,
  findUserById,
  getAllUsers,
  updateUserRoleAndStatus,
} = require('../models/userModel');
const generateToken = require('../utils/generateToken');

const registerTeacher = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await createUser({ name, email, hashedPassword });

    // New users are inactive by default — Admin must approve them before they can log in
    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for an Admin to activate your account.',
      data: { user: { id: userId, name, email } },
    });
  } catch (error) {
    return next(error);
  }
};

const loginTeacher = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Block inactive accounts — must be approved by Admin first
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. Please contact an Administrator.',
      });
    }

    // Include role + academic scope in JWT so middlewares can check both without a DB hit.
    // school_id/department_id are null for every role except School Admin/Department Admin.
    const token = generateToken({
      id: user.id, email: user.email, role: user.role,
      school_id: user.school_id || null, department_id: user.department_id || null,
    });

    // Return only safe, non-sensitive fields to the client
    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getTeacherProfile = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // findUserById already excludes password hash
    return res.json({
      success: true,
      message: 'Profile fetched successfully',
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

// Admin only: list all registered users
const listUsers = async (req, res, next) => {
  try {
    const users = await getAllUsers();
    return res.json({ success: true, data: users });
  } catch (error) {
    return next(error);
  }
};

// Admin only: update any user's role and/or active status and/or School/Department scope
// (only meaningful for School Admin / Department Admin — see userModel.addRoleScopingColumns).
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, is_active, school_id, department_id } = req.body;

    const validRoles = ['Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin'];
    if (role !== undefined && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
    if (role === 'School Admin' && !school_id) {
      return res.status(400).json({ success: false, message: 'school_id is required when assigning the School Admin role.' });
    }
    if (role === 'Department Admin' && !department_id) {
      return res.status(400).json({ success: false, message: 'department_id is required when assigning the Department Admin role.' });
    }

    const updated = await updateUserRoleAndStatus(id, { role, is_active, school_id, department_id });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found or no changes made.' });
    }

    return res.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerTeacher,
  loginTeacher,
  getTeacherProfile,
  listUsers,
  updateUser,
};

