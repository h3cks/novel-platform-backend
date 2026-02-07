import { Request, Response } from 'express';
import * as novelService from '../services/novel.service';
import prisma from '../prisma/client';
import { isValidUrl, stripTags } from '../utils/validators';
import * as publishService from '../services/publish.service';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

const MAX_GENRES = 3;
const MAX_TAGS = 20;

function validateTitle(title: any) {
  return typeof title === 'string' && title.trim().length >= 3 && title.trim().length <= 250;
}

export const createNovel = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  if (user.role === 'ADMIN') return fail(res, 403, 'ROLE_FORBIDDEN', 'Admins cannot create novels');

  if (!user.emailConfirmed) return fail(res, 403, 'EMAIL_NOT_CONFIRMED', 'Email must be confirmed to create novels');

  const { title, description, coverUrl, genreIds, tagIds } = req.body ?? {};

  if (!validateTitle(title)) return fail(res, 400, 'INVALID_TITLE', 'Invalid title (3-250 chars)');

  if (typeof description !== 'undefined' && description !== null) {
    if (typeof description !== 'string' || description.trim().length > 2000)
      return fail(res, 400, 'INVALID_DESCRIPTION', 'description max 2000 chars');
  }

  if (typeof coverUrl !== 'undefined' && coverUrl !== null) {
    if (!isValidUrl(coverUrl)) return fail(res, 400, 'INVALID_COVER_URL', 'coverUrl must be a valid URL');
  }

  if (typeof genreIds !== 'undefined' && genreIds !== null) {
    if (!Array.isArray(genreIds) || !genreIds.every((g: any) => Number.isInteger(g) && g > 0)) {
      return fail(res, 400, 'INVALID_GENRES', 'genreIds must be array of positive integers');
    }
    if (genreIds.length > MAX_GENRES) {
      return fail(res, 400, 'TOO_MANY_GENRES', `Max ${MAX_GENRES} genres allowed`);
    }
  }

  if (typeof tagIds !== 'undefined' && tagIds !== null) {
    if (!Array.isArray(tagIds) || !tagIds.every((t: any) => Number.isInteger(t) && t > 0)) {
      return fail(res, 400, 'INVALID_TAGS', 'tagIds must be array of positive integers');
    }
    if (tagIds.length > MAX_TAGS) {
      return fail(res, 400, 'TOO_MANY_TAGS', `Max ${MAX_TAGS} tags allowed`);
    }
  }

  const cleanedTitle = stripTags(String(title).trim());
  const cleanedDescription = description ? stripTags(String(description).trim()) : null;
  const cleanedCover = coverUrl ? String(coverUrl).trim() : null;

  try {
    const novel = await novelService.createNovel(
      {
        title: cleanedTitle,
        description: cleanedDescription,
        coverUrl: cleanedCover,
        genreIds: genreIds ?? undefined,
        tagIds: tagIds ?? undefined,
      },
      user.id
    );

    // If user was READER — promote to AUTHOR
    let newRole = user.role;
    if (user.role === 'READER') {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'AUTHOR' },
        select: { role: true },
      });
      newRole = updated.role;
    }

    return ok(res, { message: 'Novel created successfully', novel, newRole }, undefined, 201);
  } catch (err: any) {
    if (err?.code === 'INVALID_PAYLOAD') {
      return fail(res, 400, 'INVALID_PAYLOAD', err.message ?? 'Invalid payload');
    }
    throw err;
  }
});

export const listNovels = asyncHandler(async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const authorId = req.query.authorId ? Number(req.query.authorId) : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const genreId = req.query.genreId ? Number(req.query.genreId) : undefined;
    const tagName = typeof req.query.tagName === 'string' ? req.query.tagName : undefined;
    const tagId = req.query.tagId ? Number(req.query.tagId) : undefined;

    const requester = (req as any).user ? { id: (req as any).user.id, role: (req as any).user.role } : null;

    const result = await novelService.findNovels({
      q,
      authorId,
      status,
      page,
      limit,
      requester,
      genreId,
      tagName,
      tagId,
    });

    return ok(res, result.items, result.meta);
  } catch (err: any) {
    throw err;
  }
});

export const getNovel = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const novel = await novelService.getNovelById(id);
  if (!novel) return fail(res, 404, 'NOT_FOUND', 'Not found');

  if (novel.status !== 'PUBLISHED') {
    const user = (req as any).user;
    if (!user) return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    if (user.id !== novel.authorId && !['MODERATOR', 'ADMIN'].includes(user.role)) {
      return fail(res, 403, 'FORBIDDEN', 'Forbidden');
    }
  }

  return ok(res, { novel });
});

export const publishNovel = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const novel = await prisma.novel.findUnique({ where: { id } });
  if (!novel) return fail(res, 404, 'NOVEL_NOT_FOUND', 'Novel not found');
  if (novel.authorId !== user.id) return fail(res, 403, 'FORBIDDEN', 'Forbidden');

  const result = await publishService.attemptPublish(id, user.id);
  if (result.ok) return ok(res, { ok: true, status: result.status });
  // business validation failure -> return 400 with details
  return fail(res, 400, 'PUBLISH_VALIDATION_FAILED', 'Publish checks failed', result);
});

export const updateNovel = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const novel = await novelService.getNovelById(id);
  if (!novel) return fail(res, 404, 'NOVEL_NOT_FOUND', 'Novel not found');

  if (user.id !== novel.authorId && user.role !== 'ADMIN') {
    return fail(res, 403, 'FORBIDDEN', 'Forbidden');
  }

  const { title, description, coverUrl, genreIds, tagIds } = req.body ?? {};
  const updates: any = {};

  if (typeof title !== 'undefined') {
    if (!validateTitle(title)) return fail(res, 400, 'INVALID_TITLE', 'Invalid title (3-250 chars)');
    updates.title = stripTags(String(title).trim());
  }

  if (typeof description !== 'undefined') {
    if (description !== null && (typeof description !== 'string' || description.trim().length > 2000)) {
      return fail(res, 400, 'INVALID_DESCRIPTION', 'description max 2000 chars');
    }
    updates.description = description ? stripTags(String(description).trim()) : null;
  }

  if (typeof coverUrl !== 'undefined') {
    if (coverUrl !== null && !isValidUrl(coverUrl)) {
      return fail(res, 400, 'INVALID_COVER_URL', 'coverUrl must be a valid URL');
    }
    updates.coverUrl = coverUrl ?? null;
  }

  if (typeof genreIds !== 'undefined') {
    if (genreIds !== null && (!Array.isArray(genreIds) || !genreIds.every((g: any) => Number.isInteger(g) && g > 0))) {
      return fail(res, 400, 'INVALID_GENRES', 'genreIds must be array of positive integers or null');
    }
    if (Array.isArray(genreIds) && genreIds.length > MAX_GENRES) {
      return fail(res, 400, 'TOO_MANY_GENRES', `Max ${MAX_GENRES} genres allowed`);
    }
    updates.genreIds = genreIds; // could be null (means clear) or array
  }

  if (typeof tagIds !== 'undefined') {
    if (tagIds !== null && (!Array.isArray(tagIds) || !tagIds.every((t: any) => Number.isInteger(t) && t > 0))) {
      return fail(res, 400, 'INVALID_TAGS', 'tagIds must be array of positive integers or null');
    }
    if (Array.isArray(tagIds) && tagIds.length > MAX_TAGS) {
      return fail(res, 400, 'TOO_MANY_TAGS', `Max ${MAX_TAGS} tags allowed`);
    }
    updates.tagIds = tagIds;
  }

  if (Object.keys(updates).length === 0) return fail(res, 400, 'NO_UPDATES', 'No fields to update');

  try {
    const updated = await novelService.updateNovel(id, updates);
    return ok(res, { novel: updated });
  } catch (err: any) {
    if (err?.code === 'INVALID_PAYLOAD') {
      return fail(res, 400, 'INVALID_PAYLOAD', err.message ?? 'Invalid payload');
    }
    throw err;
  }
});

export const deleteNovel = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const novel = await novelService.getNovelById(id);
  if (!novel) return fail(res, 404, 'NOVEL_NOT_FOUND', 'Novel not found');

  if (user.id !== novel.authorId && user.role !== 'ADMIN') {
    return fail(res, 403, 'FORBIDDEN', 'Forbidden');
  }

  await novelService.deleteNovel(id);
  return ok(res, { ok: true });
});
