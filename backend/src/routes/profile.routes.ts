import { Router } from 'express';
import * as profileCtrl from '../controllers/profile.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Public: перегляд профілю по id
router.get('/:id', profileCtrl.getProfile);

// Protected: оновлення власного профілю
router.patch('/', authMiddleware, profileCtrl.updateProfile);

// Видалення акаунта з усіма даними
router.delete('/', authMiddleware, profileCtrl.deleteProfile);
router.delete('/:id', authMiddleware, profileCtrl.deleteProfile);
export default router;
