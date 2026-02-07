import { Request, Response } from 'express';
import * as commentService from '../services/comment.service';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

export const createCommentForNovel = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const novelId = Number(req.params.novelId);
  const { text, parentId } = req.body ?? {};

  try {
    const comment = await commentService.createComment({
      userId: user.id,
      novelId,
      parentId: parentId ? Number(parentId) : undefined,
      text,
    });
    return ok(res, { comment }, undefined, 201);
  } catch (err: any) {
    // map known errors
    if (err.code === 'INVALID_TEXT') return fail(res, 400, 'INVALID_TEXT', 'Comment text required');
    if (err.code === 'PARENT_NOT_FOUND') return fail(res, 404, 'PARENT_NOT_FOUND', 'Parent comment not found');
    if (err.code === 'MISSING_TARGET') return fail(res, 400, 'MISSING_TARGET', 'Either novelId or chapterId or parentId is required');
    throw err;
  }
});

export const createCommentForChapter = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const novelId = Number(req.params.novelId);
  const chapterId = Number(req.params.chapterId);
  const { text, parentId } = req.body ?? {};

  try {
    const comment = await commentService.createComment({
      userId: user.id,
      novelId,
      chapterId,
      parentId: parentId ? Number(parentId) : undefined,
      text,
    });
    return ok(res, { comment }, undefined, 201);
  } catch (err: any) {
    if (err.code === 'INVALID_TEXT') return fail(res, 400, 'INVALID_TEXT', 'Comment text required');
    if (err.code === 'PARENT_NOT_FOUND') return fail(res, 404, 'PARENT_NOT_FOUND', 'Parent comment not found');
    if (err.code === 'NOVEL_NOT_FOUND' || err.code === 'CH_NOT_FOUND') return fail(res, 404, 'TARGET_NOT_FOUND', err.message);
    throw err;
  }
});

export const replyToComment = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const parentId = Number(req.params.commentId);
  const { text } = req.body ?? {};

  try {
    const comment = await commentService.createComment({ userId: user.id, parentId, text });
    return ok(res, { comment }, undefined, 201);
  } catch (err: any) {
    if (err.code === 'INVALID_TEXT') return fail(res, 400, 'INVALID_TEXT', 'Comment text required');
    if (err.code === 'PARENT_NOT_FOUND') return fail(res, 404, 'PARENT_NOT_FOUND', 'Parent comment not found');
    if (err.code === 'MAX_DEPTH') return fail(res, 400, 'MAX_DEPTH', 'Reply depth exceeded');
    throw err;
  }
});

export const listNovelComments = asyncHandler(async (req: Request, res: Response) => {
  const novelId = Number(req.params.novelId);
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const result = await commentService.listCommentsByNovel(novelId, page, limit);
  return ok(res, result.items, result.meta);
});

export const listChapterComments = asyncHandler(async (req: Request, res: Response) => {
  const chapterId = Number(req.params.chapterId);
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const result = await commentService.listCommentsByChapter(chapterId, page, limit);
  return ok(res, result.items, result.meta);
});

export const updateComment = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const id = Number(req.params.id);
  const { text } = req.body ?? {};
  try {
    const updated = await commentService.updateComment(id, user.id, { text });
    return ok(res, { comment: updated });
  } catch (err: any) {
    if (err.code === 'FORBIDDEN') return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    if (err.code === 'NOT_FOUND') return fail(res, 404, 'NOT_FOUND', 'Comment not found');
    throw err;
  }
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const id = Number(req.params.id);
  try {
    await commentService.deleteComment(id, user.id);
    return ok(res, { ok: true });
  } catch (err: any) {
    if (err.code === 'FORBIDDEN') return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    if (err.code === 'NOT_FOUND') return fail(res, 404, 'NOT_FOUND', 'Comment not found');
    throw err;
  }
});
