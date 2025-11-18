import { body, validationResult } from 'express-validator';

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Login validation
// Note: Password length validation removed to ensure all login attempts are counted for account locking
// Actual password validation happens during authentication in the controller
export const validateLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Registration validation with stronger password requirements
export const validateRegister = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-zA-Z\s\-'.]+$/)
    .withMessage("Name must be 2-50 characters and contain only letters, spaces, hyphens (-), apostrophes ('), or dots (.)"),
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-50 characters and contain only letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .withMessage('Password must be 8-128 characters with uppercase, lowercase, number, and special character (@$!%*?&)'),
  body('role')
    .isIn(['student', 'lecturer', 'admin'])
    .withMessage('Role must be student, lecturer, or admin'),
  handleValidationErrors
];

// Password change validation
export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .withMessage('New password must be 8-128 characters with uppercase, lowercase, number, and special character (@$!%*?&)'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
  handleValidationErrors
];

// Password reset request validation
export const validatePasswordResetRequest = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  handleValidationErrors
];

// Password reset validation
export const validatePasswordReset = [
  body('token')
    .notEmpty()
    .isLength({ min: 32 })
    .withMessage('Valid reset token is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .withMessage('New password must be 8-128 characters with uppercase, lowercase, number, and special character (@$!%*?&)'),
  handleValidationErrors
];

// Exam submission validation
export const validateExamSubmission = [
  body('examId')
    .isMongoId()
    .withMessage('Invalid exam ID'),
  body('answers')
    .isArray({ min: 1 })
    .withMessage('Answers must be a non-empty array'),
  body('answers.*.questionId')
    .isString()
    .notEmpty()
    .withMessage('Question ID is required'),
  body('answers.*.answer')
    .notEmpty()
    .withMessage('Answer cannot be empty'),
  handleValidationErrors
];

// Course creation validation
export const validateCourse = [
  body('code')
    .trim()
    .isLength({ min: 3, max: 10 })
    .matches(/^[A-Z]{3}\d{3}$/)
    .withMessage('Course code must be in format ABC123'),
  body('name')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Course name must be between 5 and 100 characters'),
  handleValidationErrors
];

// User creation/update validation
export const validateUser = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-zA-Z\s\-'.]+$/)
    .withMessage("Name must be 2-50 characters and contain only letters, spaces, hyphens (-), apostrophes ('), or dots (.)"),
  body('username')
    .trim()
    .custom((value) => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isLegacy = /^[a-zA-Z0-9_]+$/.test(value);
      if (!isEmail && !isLegacy) {
        throw new Error('Username must be a valid email or alphanumeric with underscores');
      }
      return true;
    }),
  body('role')
    .isIn(['student', 'lecturer', 'admin'])
    .withMessage('Role must be student, lecturer, or admin'),
  body('password')
    .optional()
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .withMessage('Password must be 8-128 characters with uppercase, lowercase, number, and special character (@$!%*?&)'),
  body('enrolledCourseIds')
    .optional()
    .isArray()
    .withMessage('Enrolled courses must be an array'),
  body('enrolledCourseIds.*')
    .optional()
    .isMongoId()
    .withMessage('Invalid course ID'),
  handleValidationErrors
];

// Exam creation validation
export const validateExam = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Exam title must be between 5 and 100 characters'),
  body('courseId')
    .isMongoId()
    .withMessage('Invalid course ID'),
  body('durationMinutes')
    .isInt({ min: 5, max: 300 })
    .withMessage('Duration must be between 5 and 300 minutes'),
  // Date validation temporarily removed to debug
  // body('availableFrom')
  //   .optional()
  //   .isISO8601()
  //   .withMessage('Available from must be a valid date'),
  // body('availableUntil')
  //   .optional()
  //   .isISO8601()
  //   .withMessage('Available until must be a valid date'),
  handleValidationErrors
];

// Question validation
export const validateQuestion = [
  body('text')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Question text must be between 10 and 1000 characters'),
  body('type')
    .isIn(['MCQ', 'TF', 'SA', 'Essay'])
    .withMessage('Question type must be MCQ, TF, SA, or Essay'),
  body('difficulty')
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard'),
  body('points')
    .isInt({ min: 1, max: 100 })
    .withMessage('Points must be between 1 and 100'),
  body('courseId')
    .isMongoId()
    .withMessage('Invalid course ID'),
  handleValidationErrors
];

// Log creation validation
export const validateLog = [
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('type')
    .isIn(['violation', 'login', 'logout', 'submission'])
    .withMessage('Log type must be violation, login, logout, or submission'),
  body('details')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Details must be between 1 and 500 characters'),
  handleValidationErrors
];