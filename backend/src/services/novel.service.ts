// backend/src/services/novel.service.ts
import prisma from '../prisma/client';

const MAX_GENRES = 3;
const MAX_TAGS = 20;

function toSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '') // remove non-word chars
    .replace(/\-+/g, '-')
    .slice(0, 100);
}

export type NovelCreateInput = {
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  genreIds?: number[];           // connect existing genres by id (only existing)
  genreNames?: string[];         // connect by name (existing), optionally create missing if flag set (admin)
  createMissingGenres?: boolean; // only allow when controller passes admin permission
  tagIds?: number[];             // connect existing tags by id (only existing) — NEW
};

export async function createNovel(data: NovelCreateInput, authorId: number) {
  // validate counts and existence BEFORE creating the novel
  if (Array.isArray(data.genreIds) && data.genreIds.length > MAX_GENRES) {
    throw { code: 'INVALID_PAYLOAD', message: `Max ${MAX_GENRES} genres allowed` };
  }
  if (Array.isArray(data.tagIds) && data.tagIds.length > MAX_TAGS) {
    throw { code: 'INVALID_PAYLOAD', message: `Max ${MAX_TAGS} tags allowed` };
  }

  // validate existence of provided genreIds (if any)
  if (Array.isArray(data.genreIds) && data.genreIds.length > 0) {
    const existing = await prisma.genre.findMany({ where: { id: { in: data.genreIds } }, select: { id: true } });
    const existingIds = new Set(existing.map((g) => g.id));
    const missing = data.genreIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw { code: 'INVALID_PAYLOAD', message: `Invalid genreIds: ${missing.join(',')}` };
    }
  }

  // validate existence of provided tagIds (if any)
  if (Array.isArray(data.tagIds) && data.tagIds.length > 0) {
    const existing = await prisma.tag.findMany({ where: { id: { in: data.tagIds } }, select: { id: true } });
    const existingIds = new Set(existing.map((t) => t.id));
    const missing = data.tagIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw { code: 'INVALID_PAYLOAD', message: `Invalid tagIds: ${missing.join(',')}` };
    }
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.novel.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        coverUrl: data.coverUrl ?? null,
        authorId,
        status: 'DRAFT',
      },
    });

    // connect by genreIds (guaranteed exist)
    if (Array.isArray(data.genreIds) && data.genreIds.length > 0) {
      for (const gid of data.genreIds) {
        // assume validated above
        try {
          await tx.novelGenre.create({ data: { novelId: created.id, genreId: gid } });
        } catch (e) {
          // ignore duplicate or transient errors for individual relations
        }
      }
    }

    // connect by genreNames (only existing unless createMissingGenres true)
    if (Array.isArray(data.genreNames) && data.genreNames.length > 0) {
      for (const raw of data.genreNames) {
        const name = String(raw).trim();
        if (!name) continue;
        const existing = await tx.genre.findUnique({ where: { name } });
        if (existing) {
          try {
            await tx.novelGenre.create({ data: { novelId: created.id, genreId: existing.id } });
          } catch (e) {}
        } else if (data.createMissingGenres) {
          try {
            const newGenre = await tx.genre.create({ data: { name, slug: toSlug(name) } });
            await tx.novelGenre.create({ data: { novelId: created.id, genreId: newGenre.id } });
          } catch (e) {
            // ignore
          }
        } else {
          // skip unknown genre (we could also throw — controller already validated genreIds; genreNames are optional)
        }
      }
    }

    // connect by tagIds (guaranteed exist)
    if (Array.isArray(data.tagIds) && data.tagIds.length > 0) {
      for (const tid of data.tagIds) {
        try {
          await tx.novelTag.create({ data: { novelId: created.id, tagId: tid } });
        } catch (e) {
          // ignore duplicates
        }
      }
    }

    return created;
  });
}

export type FindNovelsOptions = {
  q?: string | null;
  authorId?: number | null;
  status?: string | null;
  page?: number;
  limit?: number;
  requester?: { id: number; role: string } | null;
  genreId?: number | null;
  tagName?: string | null;
  tagId?: number | null; // NEW: optional filter by tag id
};

export async function findNovels(opts: FindNovelsOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (opts.q) {
    where.title = { contains: opts.q, mode: 'insensitive' as const };
  }
  if (opts.authorId) where.authorId = opts.authorId;

  // Visibility handling
  if (opts.status) {
    if (
      opts.requester?.role === 'ADMIN' ||
      opts.requester?.role === 'MODERATOR' ||
      (opts.requester && opts.authorId && opts.requester.id === opts.authorId)
    ) {
      where.status = opts.status;
    } else {
      where.status = 'PUBLISHED';
    }
  } else {
    if (opts.requester?.role === 'ADMIN' || opts.requester?.role === 'MODERATOR') {
      // all
    } else if (opts.requester && opts.authorId && opts.requester.id === opts.authorId) {
      // author sees own
    } else {
      where.status = 'PUBLISHED';
    }
  }

  // if filtering by genre or tag -> restrict by novel ids
  if (opts.genreId || opts.tagName || opts.tagId) {
    let allowedIds: number[] | null = null;

    if (opts.genreId) {
      const rows = await prisma.novelGenre.findMany({ where: { genreId: opts.genreId }, select: { novelId: true } });
      const ids = rows.map((r) => r.novelId);
      if (ids.length === 0) return { items: [], meta: { page, limit, total: 0 } };
      allowedIds = ids;
    }

    if (opts.tagName) {
      const tag = await prisma.tag.findUnique({ where: { name: opts.tagName } });
      if (!tag) return { items: [], meta: { page, limit, total: 0 } };
      const rows = await prisma.novelTag.findMany({ where: { tagId: tag.id }, select: { novelId: true } });
      const ids = rows.map((r) => r.novelId);
      if (ids.length === 0) return { items: [], meta: { page, limit, total: 0 } };
      if (allowedIds === null) allowedIds = ids;
      else allowedIds = allowedIds.filter((i) => ids.includes(i));
      if (allowedIds.length === 0) return { items: [], meta: { page, limit, total: 0 } };
    }

    if (typeof opts.tagId === 'number') {
      const rows = await prisma.novelTag.findMany({ where: { tagId: opts.tagId }, select: { novelId: true } });
      const ids = rows.map((r) => r.novelId);
      if (ids.length === 0) return { items: [], meta: { page, limit, total: 0 } };
      if (allowedIds === null) allowedIds = ids;
      else allowedIds = allowedIds.filter((i) => ids.includes(i));
      if (allowedIds.length === 0) return { items: [], meta: { page, limit, total: 0 } };
    }

    where.id = { in: allowedIds as number[] };
  }

  const [total, items] = await Promise.all([
    prisma.novel.count({ where }),
    prisma.novel.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        tags: { include: { tag: true } },
        genres: { include: { genre: true } },
      },
    }),
  ]);

  return { items, meta: { page, limit, total } };
}

export async function getNovelById(id: number) {
  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      tags: { include: { tag: true } },
      genres: { include: { genre: true } },
      // do not include heavy relations by default (chapters omitted)
    },
  });
  return novel;
}

export async function updateNovel(
  id: number,
  updates: {
    title?: string;
    description?: string | null;
    coverUrl?: string | null;
    genreIds?: number[] | null;
    genreNames?: string[] | null;
    createMissingGenres?: boolean; // controller must only set true for admin
    tagIds?: number[] | null;       // NEW: replace tags by ids
  }
) {
  // validate counts and existence BEFORE transaction when arrays are provided
  if (Array.isArray(updates.genreIds) && updates.genreIds.length > MAX_GENRES) {
    throw { code: 'INVALID_PAYLOAD', message: `Max ${MAX_GENRES} genres allowed` };
  }
  if (Array.isArray(updates.tagIds) && updates.tagIds.length > MAX_TAGS) {
    throw { code: 'INVALID_PAYLOAD', message: `Max ${MAX_TAGS} tags allowed` };
  }

  if (Array.isArray(updates.genreIds) && updates.genreIds.length > 0) {
    const existing = await prisma.genre.findMany({ where: { id: { in: updates.genreIds } }, select: { id: true } });
    const existingIds = new Set(existing.map((g) => g.id));
    const missing = updates.genreIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw { code: 'INVALID_PAYLOAD', message: `Invalid genreIds: ${missing.join(',')}` };
    }
  }

  if (Array.isArray(updates.tagIds) && updates.tagIds.length > 0) {
    const existing = await prisma.tag.findMany({ where: { id: { in: updates.tagIds } }, select: { id: true } });
    const existingIds = new Set(existing.map((t) => t.id));
    const missing = updates.tagIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw { code: 'INVALID_PAYLOAD', message: `Invalid tagIds: ${missing.join(',')}` };
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.novel.update({
      where: { id },
      data: {
        title: updates.title,
        description: typeof updates.description !== 'undefined' ? updates.description : undefined,
        coverUrl: typeof updates.coverUrl !== 'undefined' ? updates.coverUrl : undefined,
      },
    });

    // replace genres by ids if provided
    if (Array.isArray(updates.genreIds)) {
      await tx.novelGenre.deleteMany({ where: { novelId: id } });
      for (const gid of updates.genreIds) {
        if (!Number.isInteger(gid) || gid <= 0) continue;
        try {
          await tx.novelGenre.create({ data: { novelId: id, genreId: gid } });
        } catch (e) {}
      }
    }

    // replace genres by names if provided (keeps previous behavior)
    if (Array.isArray(updates.genreNames)) {
      await tx.novelGenre.deleteMany({ where: { novelId: id } });
      for (const raw of updates.genreNames) {
        const name = String(raw).trim();
        if (!name) continue;
        const existing = await tx.genre.findUnique({ where: { name } });
        if (existing) {
          try {
            await tx.novelGenre.create({ data: { novelId: id, genreId: existing.id } });
          } catch (e) {}
        } else if (updates.createMissingGenres) {
          try {
            const newGenre = await tx.genre.create({ data: { name, slug: toSlug(name) } });
            await tx.novelGenre.create({ data: { novelId: id, genreId: newGenre.id } });
          } catch (e) {}
        }
      }
    }

    // replace tags by ids if provided
    if (Array.isArray(updates.tagIds)) {
      await tx.novelTag.deleteMany({ where: { novelId: id } });
      for (const tid of updates.tagIds) {
        if (!Number.isInteger(tid) || tid <= 0) continue;
        try {
          await tx.novelTag.create({ data: { novelId: id, tagId: tid } });
        } catch (e) {}
      }
    }

    return updated;
  });
}

export async function deleteNovel(id: number) {
  return prisma.$transaction(async (tx) => {
    try { await tx.viewHistory.deleteMany({ where: { novelId: id } }); } catch (e) {}
    try { await tx.chapter.deleteMany({ where: { novelId: id } }); } catch (e) {}
    try { await tx.comment.deleteMany({ where: { novelId: id } }); } catch (e) {}
    try { await tx.rating.deleteMany({ where: { novelId: id } }); } catch (e) {}
    try { await tx.novelTag.deleteMany({ where: { novelId: id } }); } catch (e) {}
    try { await tx.novelGenre.deleteMany({ where: { novelId: id } }); } catch (e) {}
    try { await tx.follow.deleteMany({ where: { novelId: id } }); } catch (e) {}
    const deleted = await tx.novel.delete({ where: { id } });
    return deleted;
  });
}
