const bcrypt = require('bcryptjs');
const { findUserByEmail, createUser, findUserById } = require('../models/userModel');
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

    const token = generateToken({ id: userId, email });

    return res.status(201).json({
      success: true,
      message: 'Teacher registered successfully',
      data: {
        token,
        user: {
          id: userId,
          name,
          email,
        },
      },
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

    const token = generateToken({ id: user.id, email: user.email });

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
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

    return res.json({
      success: true,
      message: 'Profile fetched successfully',
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerTeacher,
  loginTeacher,
  getTeacherProfile,
};
