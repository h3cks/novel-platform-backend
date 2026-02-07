import { Router } from 'express';
import * as novelCtrl from '../controllers/novel.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authOptional } from '../middlewares/authOptional.middleware';

const router = Router();


router.post('/', authMiddleware, novelCtrl.createNovel);


// List novels (public, but attach optional user info if token present)
router.get('/', authOptional, novelCtrl.listNovels);


// Get novel by id (attach optional auth to check access)
router.get('/:id', authOptional, novelCtrl.getNovel);


router.post('/:id/publish', authMiddleware, novelCtrl.publishNovel);


// edit & delete
router.patch('/:id', authMiddleware, novelCtrl.updateNovel);
router.delete('/:id', authMiddleware, novelCtrl.deleteNovel);


export default router;