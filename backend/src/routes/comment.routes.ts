import { Router } from 'express';
import * as commentCtrl from '../controllers/comment.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authOptional } from '../middlewares/authOptional.middleware';

const router = Router();

// create comment on novel
router.post('/novels/:novelId/comments', authMiddleware, commentCtrl.createCommentForNovel);

// create comment on chapter
router.post('/novels/:novelId/chapters/:chapterId/comments', authMiddleware, commentCtrl.createCommentForChapter);

// reply to comment (alternative: POST /comments/:commentId/replies)
router.post('/comments/:commentId/replies', authMiddleware, commentCtrl.replyToComment);

// list comments
router.get('/novels/:novelId/comments', authOptional, commentCtrl.listNovelComments);
router.get('/novels/:novelId/chapters/:chapterId/comments', authOptional, commentCtrl.listChapterComments);

// update / delete
router.patch('/comments/:id', authMiddleware, commentCtrl.updateComment);
router.delete('/comments/:id', authMiddleware, commentCtrl.deleteComment);

export default router;
