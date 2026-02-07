// backend/src/services/genre.service.ts
import prisma from '../prisma/client';

export type GenreBrief = { id: number; name: string; slug?: string; description?: string };

export async function listGenres(q?: string | null): Promise<GenreBrief[]> {
  const where = q && q.trim() !== '' ? { name: { contains: q, mode: 'insensitive' as const } } : undefined;
  const rows = await prisma.genre.findMany({
    where,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, description: true },
  });

  // Normalize null -> undefined to satisfy GenreBrief (slug?: string; description?: string)
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? undefined,
    description: r.description ?? undefined,
  }));
}

export async function getGenresByIds(ids: number[]) {
  const rows = await prisma.genre.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, description: true },
  });

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? undefined,
    description: r.description ?? undefined,
  }));
}
