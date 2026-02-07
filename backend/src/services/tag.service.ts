// backend/src/services/tag.service.ts
import prisma from '../prisma/client';

export type TagBrief = { id: number; name: string; slug?: string };

export async function searchTags(query?: string | null, limit = 20): Promise<TagBrief[]> {
  const take = Math.min(Math.max(1, limit), 100);
  const where = query && query.trim() !== ''
    ? { name: { contains: query, mode: 'insensitive' as const } }
    : undefined;

  const rows = await prisma.tag.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, name: true, slug: true },
  });

  // Normalize null -> undefined
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? undefined,
  }));
}

export async function listTagsByIds(ids: number[]) {
  const rows = await prisma.tag.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true },
  });

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? undefined,
  }));
}
