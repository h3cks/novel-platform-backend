// backend/src/services/notification.service.ts
import prisma from '../prisma/client';

type NotificationRow = {
  userId: number | null;
  type: string;
  targetType?: string | null;
  targetId?: number | null;
  taskId?: number | null;
  actorId?: number | null;
  message: string;
};

export async function createNotification(row: NotificationRow) {
  return prisma.notification.create({ data: row });
}

/**
 * Bulk create notifications for many users (efficient).
 * - rows will share same payload except userId
 * - skipDuplicates: avoid creating duplicate (DB unique constraints not assumed)
 *
 * We chunk requests to avoid overly large createMany payloads.
 */
export async function bulkCreateNotifications(targetUserIds: number[], payload: Omit<NotificationRow, 'userId'>) {
  if (!targetUserIds || targetUserIds.length === 0) return [];

  // dedupe
  const unique = Array.from(new Set(targetUserIds));

  const CHUNK_SIZE = 800; // safe batch size (tuneable)
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const data = chunk.map((uid) => ({ ...payload, userId: uid }));
    // createMany is faster; skipDuplicates avoids some duplicate insert errors
    await prisma.notification.createMany({ data, skipDuplicates: true });
  }

  return true;
}

/**
 * Notify followers of a novel (bulk).
 * - collects followers of the novel (Follow model)
 * - collects followers of the author (UserFollow model)
 * - deduplicates recipients and removes the actor (if provided)
 * - creates notifications in bulk (batched)
 *
 * extra: optional payload additions (targetType/targetId)
 */
export async function notifyNovelAndAuthorFollowers(
  novelId: number,
  actorId: number | null,
  message: string,
  extra?: { targetType?: string; targetId?: number }
) {
  // load novel to get authorId
  const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { authorId: true } });
  if (!novel) return false;

  // 1) novel followers (follow.user -> userId)
  const novelFollowers = await prisma.follow.findMany({ where: { novelId }, select: { userId: true } });
  const novelUserIds = novelFollowers.map(f => f.userId).filter(Boolean) as number[];

  // 2) author followers via userFollow (followerId)
  const authorFollowers = await prisma.userFollow.findMany({ where: { authorId: novel.authorId }, select: { followerId: true } });
  const authorFollowersIds = authorFollowers.map(f => f.followerId).filter(Boolean) as number[];

  // Deduplicate and remove actor
  const recipientsSet = new Set<number>();
  novelUserIds.forEach(id => recipientsSet.add(id));
  authorFollowersIds.forEach(id => recipientsSet.add(id));
  if (actorId) recipientsSet.delete(actorId);

  const userIds = Array.from(recipientsSet);
  if (userIds.length === 0) return false;

  await bulkCreateNotifications(userIds, {
    type: 'NEW_CHAPTER',
    targetType: extra?.targetType ?? 'novel',
    targetId: extra?.targetId ?? novelId,
    actorId: actorId ?? null,
    message,
  });

  return true;
}
