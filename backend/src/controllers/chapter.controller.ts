import { Request, Response } from 'express';
import * as chapterService from '../services/chapter.service';
import prisma from '../prisma/client';
import { sanitizeContent, countWordsFromHtml } from '../utils/text';
import { MIN_WORDS_PER_CHAPTER } from '../config';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

function validateTitle(title: any) {
  return typeof title === 'string' && title.trim().length >= 1 && title.trim().length <= 250;
}

function validateContent(content: any) {
  return typeof content === 'string' && content.trim().length > 0;
}

export const createChapter = asyncHandler(async (req: Request, res: Response) => {
  const novelId = Number(req.params.novelId);
  if (!Number.isInteger(novelId) || novelId <= 0) return fail(res, 400, 'INVALID_NOVEL_ID', 'Invalid novelId');

  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) return fail(res, 404, 'NOVEL_NOT_FOUND', 'Novel not found');

  if (user.role === 'ADMIN' || user.role === 'MODERATOR') {
    return fail(res, 403, 'ROLE_FORBIDDEN', 'Admins and moderators cannot create chapters');
  }
  if (user.id !== novel.authorId) {
    return fail(res, 403, 'FORBIDDEN', 'Forbidden');
  }

  const { title, content } = req.body ?? {};
  if (!validateTitle(title)) return fail(res, 400, 'INVALID_TITLE', 'Invalid title');
  if (!validateContent(content)) return fail(res, 400, 'INVALID_CONTENT', 'Content required');

  const cleanContent = sanitizeContent(content);
  const wc = countWordsFromHtml(cleanContent);
  if (wc < MIN_WORDS_PER_CHAPTER) {
    return fail(res, 400, 'CHAPTER_TOO_SHORT', `Chapter must have at least ${MIN_WORDS_PER_CHAPTER} words after sanitization`);
  }

  try {
    const chapter = await chapterService.createChapter(novelId, user.id, { title: String(title).trim(), content: cleanContent });
    return ok(res, { chapter }, undefined, 201);
  } catch (err: any) {
    if (err?.code === 'NOVEL_NOT_FOUND') return fail(res, 404, 'NOVEL_NOT_FOUND', 'Novel not found');
    // allow global handler to log unexpected errors
    throw err;
  }
});

export const listChapters = asyncHandler(async (req: Request, res: Response) => {
  const novelId = Number(req.params.novelId);
  if (!Number.isInteger(novelId) || novelId <= 0) return fail(res, 400, 'INVALID_NOVEL_ID', 'Invalid novelId');

  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) return fail(res, 404, 'NOVEL_NOT_FOUND', 'Novel not found');

  if (novel.status !== 'PUBLISHED') {
    const user = (req as any).user;
    if (!user) return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    if (user.id !== novel.authorId && !['MODERATOR', 'ADMIN'].includes(user.role)) {
      return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    }
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const result = await chapterService.listChaptersByNovel(novelId, page, limit);
  return ok(res, result.items, result.meta);
});

export const getChapter = asyncHandler(async (req: Request, res: Response) => {
  const novelId = Number(req.params.novelId);
  const id = Number(req.params.id);
  if (!Number.isInteger(novelId) || novelId <= 0) return fail(res, 400, 'INVALID_NOVEL_ID', 'Invalid novelId');
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const chapter = await chapterService.getChapterById(id);
  if (!chapter) return fail(res, 404, 'CHAPTER_NOT_FOUND', 'Chapter not found');

  if (chapter.novelId !== novelId) return fail(res, 400, 'CHAPTER_MISMATCH', 'Chapter does not belong to this novel');

  if (chapter.novel.status !== 'PUBLISHED') {
    const user = (req as any).user;
    if (!user) return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    if (user.id !== chapter.novel.authorId && !['MODERATOR', 'ADMIN'].includes(user.role)) {
      return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    }
  }

  const user = (req as any).user;
  if (user) {
    try {
      await prisma.viewHistory.create({
        data: {
          userId: user.id,
          novelId: chapter.novelId,
          chapterId: chapter.id,
        },
      });
    } catch (e) {
      // best-effort, ignore view logging failures
    }
  }

  return ok(res, { chapter });
});

export const updateChapter = asyncHandler(async (req: Request, res: Response) => {
  const novelId = Number(req.params.novelId);
  const id = Number(req.params.id);
  if (!Number.isInteger(novelId) || novelId <= 0) return fail(res, 400, 'INVALID_NOVEL_ID', 'Invalid novelId');
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const chapter = await chapterService.getChapterById(id);
  if (!chapter) return fail(res, 404, 'CHAPTER_NOT_FOUND', 'Chapter not found');
  if (chapter.novelId !== novelId) return fail(res, 400, 'CHAPTER_MISMATCH', 'Chapter does not belong to this novel');

  if (user.id !== chapter.novel.authorId && user.role !== 'ADMIN') {
    return fail(res, 403, 'FORBIDDEN', 'Forbidden');
  }

  const { title, content } = req.body ?? {};
  if (typeof title !== 'undefined') {
    if (!validateTitle(title)) return fail(res, 400, 'INVALID_TITLE', 'Invalid title (1-250 chars)');
  }
  if (typeof content !== 'undefined') {
    if (!validateContent(content)) return fail(res, 400, 'INVALID_CONTENT', 'Invalid content');
    const wc = countWordsFromHtml(content);
    if (wc < MIN_WORDS_PER_CHAPTER) {
      return fail(res, 400, 'CHAPTER_TOO_SHORT', `Chapter must have at least ${MIN_WORDS_PER_CHAPTER} words`);
    }
  }

  const updated = await chapterService.updateChapter(id, { title, content });
  return ok(res, { chapter: updated });
});

export const deleteChapter = asyncHandler(async (req: Request, res: Response) => {
  const novelId = Number(req.params.novelId);
  const id = Number(req.params.id);
  if (!Number.isInteger(novelId) || novelId <= 0) return fail(res, 400, 'INVALID_NOVEL_ID', 'Invalid novelId');
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const chapter = await chapterService.getChapterById(id);
  if (!chapter) return fail(res, 404, 'CHAPTER_NOT_FOUND', 'Chapter not found');
  if (chapter.novelId !== novelId) return fail(res, 400, 'CHAPTER_MISMATCH', 'Chapter does not belong to this novel');

  if (user.id !== chapter.novel.authorId && user.role !== 'ADMIN') {
    return fail(res, 403, 'FORBIDDEN', 'Forbidden');
  }

  await chapterService.deleteChapter(id);
  return ok(res, { ok: true });
});
