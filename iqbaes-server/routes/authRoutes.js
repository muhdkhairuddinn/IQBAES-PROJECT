import express from 'express';
import { loginUser, registerUser, refreshToken, logoutUser, requestPasswordReset, resetPassword } from '../controllers/authController.js';
import { validateLogin, validateRegister, validatePasswordReset, validatePasswordResetRequest } from '../middleware/validation.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', validateLogin, loginUser);
router.post('/register', validateRegister, registerUser);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logoutUser);
router.post('/request-password-reset', validatePasswordResetRequest, requestPasswordReset);
router.post('/reset-password', validatePasswordReset, resetPassword);

export default router;
