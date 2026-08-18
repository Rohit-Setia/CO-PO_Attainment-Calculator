const pool = require('../config/db');

/**
 * authorizeRoles(...allowedRoles)
 * A simple role-level gate. Reads req.user.role from the JWT (set by authMiddleware).
 * Usage: router.post('/some-route', protect, authorizeRoles('Admin', 'Examination Team'), handler)
 */
const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: Only ${allowedRoles.join(', ')} can perform this action.`,
    });
  }
  return next();
};

/**
 * checkCoursePermission(requiredAssignedRoles)
 * Fine-grained ownership/assignment guard for course-level routes.
 *
 * Access rules:
 *  - Admin / Examination Team: always allowed (bypass ownership check).
 *  - Teacher: allowed if they are the course creator (teacher_id) or assigned as 'Teacher'.
 *  - Viewer: allowed if they are assigned as 'Viewer' (read-only routes only).
 *
 * requiredAssignedRoles controls which assignment levels are enough for non-Admin / non-ExamTeam users.
 * e.g. checkCoursePermission(['Teacher']) blocks Viewers from write routes.
 *      checkCoursePermission(['Teacher', 'Viewer']) allows both on read routes.
 *
 * Usage: router.post('/courses/:id/marks', protect, checkCoursePermission(['Teacher']), handler)
 */
const checkCoursePermission = (requiredAssignedRoles = ['Teacher', 'Viewer']) => async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const courseId = req.params.id || req.body.courseId;

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required.' });
    }

    // Admins and Examination Team bypass all ownership checks
    if (userRole === 'Admin' || userRole === 'Examination Team') {
      return next();
    }

    // Check if user is the course owner (creator)
    const [ownerRows] = await pool.query(
      'SELECT id FROM courses WHERE id = ? AND teacher_id = ?',
      [courseId, userId],
    );
    if (ownerRows.length > 0) {
      // Course owner always has full permission
      return next();
    }

    // Check assignment table for non-owner users
    const [assignRows] = await pool.query(
      'SELECT assigned_role FROM user_course_assignments WHERE course_id = ? AND user_id = ?',
      [courseId, userId],
    );

    if (assignRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not assigned to this course.',
      });
    }

    const assignedRole = assignRows[0].assigned_role;
    if (!requiredAssignedRoles.includes(assignedRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Your assignment level does not allow this action.',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { authorizeRoles, checkCoursePermission };
