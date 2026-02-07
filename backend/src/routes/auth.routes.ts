import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { loginRateLimiter, softRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

/**
 * Public:
 * POST /auth/register
 * GET  /auth/confirm?token=
 * POST /auth/resend-confirmation
 * POST /auth/login
 * POST /auth/request-password-reset
 * POST /auth/reset-password
 */
router.post('/register', authCtrl.register);
router.get('/confirm', authCtrl.confirmEmail);
router.post('/resend-confirmation', softRateLimiter, authCtrl.resendConfirmation);

router.post('/login', loginRateLimiter, authCtrl.login);

router.post('/request-password-reset', softRateLimiter, authCtrl.requestPasswordReset);
router.post('/reset-password', authCtrl.resetPassword);

// Protected
router.get('/me', authMiddleware, authCtrl.me);
router.post('/change-password', authMiddleware, authCtrl.changePassword);

export default router;
