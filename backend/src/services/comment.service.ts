// src/services/comment.service.ts
import prisma from '../prisma/client';
import { sanitizeContent } from '../utils/text';

type CreateCommentInput = {
  userId: number;
  novelId?: number | null;
  chapterId?: number | null;
  parentId?: number | null;
  text: string;
};

const MAX_REPLY_DEPTH = 5; // policy: max nesting to avoid runaway threads

async function computeReplyDepth(parentId: number | null): Promise<number> {
  if (!parentId) return 0;
  let depth = 1;
  let curId = parentId;
  while (curId && depth < 100) {
    const p = await prisma.comment.findUnique({ where: { id: curId }, select: { parentId: true } });
    if (!p?.parentId) break;
    curId = p.parentId;
    depth++;
    if (depth >= MAX_REPLY_DEPTH) break;
  }
  return depth;
}

export async function createComment(input: CreateCommentInput) {
  // validation
  if (!input.text || typeof input.text !== 'string' || input.text.trim().length === 0) {
    throw Object.assign(new Error('Comment text required'), { code: 'INVALID_TEXT' });
  }

  // sanitize text
  const clean = sanitizeContent(input.text);
  // optionally enforce minimum words:
  // const wc = countWordsFromHtml(clean);
  // if (wc < 1) throw ...

  return prisma.$transaction(async (tx) => {
    // If parentId provided -> ensure it exists and inherit novel/chapter
    let novelId = input.novelId ?? null;
    let chapterId = input.chapterId ?? null;
    if (input.parentId) {
      const parent = await tx.comment.findUnique({
        where: { id: input.parentId },
        select: { id: true, novelId: true, chapterId: true, parentId: true },
      });
      if (!parent) throw Object.assign(new Error('Parent comment not found'), { code: 'PARENT_NOT_FOUND' });

      // compute depth and optionally reject if too deep
      const depth = await computeReplyDepth(input.parentId);
      if (depth >= MAX_REPLY_DEPTH) {
        throw Object.assign(new Error('Reply depth exceeded'), { code: 'MAX_DEPTH' });
      }

      novelId = parent.novelId ?? null;
      chapterId = parent.chapterId ?? null;
    } else {
      // If no parent, ensure novelId or chapterId provided and exist
      if (!novelId && !chapterId) {
        throw Object.assign(new Error('Either novelId or chapterId or parentId is required'), { code: 'MISSING_TARGET' });
      }
      if (novelId) {
        const n = await tx.novel.findUnique({ where: { id: novelId } });
        if (!n) throw Object.assign(new Error('Novel not found'), { code: 'NOVEL_NOT_FOUND' });
      }
      if (chapterId) {
        const ch = await tx.chapter.findUnique({ where: { id: chapterId } });
        if (!ch) throw Object.assign(new Error('Chapter not found'), { code: 'CH_NOT_FOUND' });
      }
    }

    const created = await tx.comment.create({
      data: {
        userId: input.userId,
        novelId: novelId,
        chapterId: chapterId,
        parentId: input.parentId ?? null,
        text: clean,
      },
    });

    return created;
  });
}

/**
 * List top-level comments for a novel (or chapter)
 * Returns: items array of comments with `replies` (first-level) included
 */
export async function listCommentsByNovel(novelId: number, page = 1, limit = 20) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  const skip = (p - 1) * l;

  const [total, items] = await Promise.all([
    prisma.comment.count({ where: { novelId, parentId: null, deleted: false } }),
    prisma.comment.findMany({
      where: { novelId, parentId: null, deleted: false },
      orderBy: { createdAt: 'desc' },
      skip,
      take: l,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replies: {
          where: { deleted: false },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
          take: 10, // first-level replies cap
        },
      },
    }),
  ]);

  return { items, meta: { page: p, limit: l, total } };
}

export async function listCommentsByChapter(chapterId: number, page = 1, limit = 20) {
  // same as above but where: { chapterId, parentId: null }
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  const skip = (p - 1) * l;

  const [total, items] = await Promise.all([
    prisma.comment.count({ where: { chapterId, parentId: null, deleted: false } }),
    prisma.comment.findMany({
      where: { chapterId, parentId: null, deleted: false },
      orderBy: { createdAt: 'desc' },
      skip,
      take: l,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replies: {
          where: { deleted: false },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
          take: 10,
        },
      },
    }),
  ]);

  return { items, meta: { page: p, limit: l, total } };
}

export async function getCommentById(id: number) {
  const c = await prisma.comment.findUnique({
    where: { id },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }, replies: true },
  });
  return c;
}

export async function updateComment(commentId: number, actorId: number, data: { text?: string }) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw Object.assign(new Error('Comment not found'), { code: 'NOT_FOUND' });
  if (comment.userId !== actorId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });

  const updates: any = {};
  if (typeof data.text !== 'undefined') {
    updates.text = sanitizeContent(data.text);
  }

  const updated = await prisma.comment.update({ where: { id: commentId }, data: updates });
  return updated;
}

export async function deleteComment(commentId: number, actorId: number) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw Object.assign(new Error('Comment not found'), { code: 'NOT_FOUND' });

  // Allow author or admin
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (comment.userId !== actorId && user?.role !== 'ADMIN') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
  }

  // Soft delete
  const deleted = await prisma.comment.update({
    where: { id: commentId },
    data: { deleted: true, text: '[deleted]' },
  });
  return deleted;
}
