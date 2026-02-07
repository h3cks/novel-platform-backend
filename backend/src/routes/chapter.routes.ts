// src/routes/chapter.routes.ts
import { Router } from 'express';
import * as chapterCtrl from '../controllers/chapter.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authOptional } from '../middlewares/authOptional.middleware';

const router = Router();

// Create chapter (author or moderator)
router.post('/novels/:novelId/chapters', authMiddleware, chapterCtrl.createChapter);

// List chapters (public if novel published)
router.get('/novels/:novelId/chapters', authOptional, chapterCtrl.listChapters);

// Get one chapter
router.get('/novels/:novelId/chapters/:id', authOptional, chapterCtrl.getChapter);

// Update chapter
router.patch('/novels/:novelId/chapters/:id', authMiddleware, chapterCtrl.updateChapter);

// Delete chapter
router.delete('/novels/:novelId/chapters/:id', authMiddleware, chapterCtrl.deleteChapter);

export default router;
