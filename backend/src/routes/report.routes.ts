// backend/src/routes/report.routes.ts
import { Router } from 'express';
import * as reportCtrl from '../controllers/report.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { softRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

// create report (authenticated users)
router.post('/', authMiddleware, softRateLimiter, reportCtrl.createReport);

// moderator endpoints — доступ лише MODERATOR | ADMIN
router.get('/', authMiddleware, requireRole(['MODERATOR', 'ADMIN']), reportCtrl.listReports);
router.get('/:id', authMiddleware, requireRole(['MODERATOR', 'ADMIN']), reportCtrl.getReport);
router.patch('/:id', authMiddleware, requireRole(['MODERATOR', 'ADMIN']), reportCtrl.processReport);

export default router;
