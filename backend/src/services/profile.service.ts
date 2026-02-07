// backend/src/services/profile.service.ts
import prisma from '../prisma/client';

export async function getProfileById(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      emailConfirmed: true,
      createdAt: true,
    },
  });
  return user ?? null;
}

export async function updateProfile(userId: number, data: { displayName?: string | null; avatarUrl?: string | null }) {
  const toUpdate: any = {};
  if (typeof data.displayName !== 'undefined') toUpdate.displayName = data.displayName;
  if (typeof data.avatarUrl !== 'undefined') toUpdate.avatarUrl = data.avatarUrl;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: toUpdate,
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      emailConfirmed: true,
      createdAt: true,
    },
  });
  return updated;
}

/**
 * Видалити користувача і всі пов'язані дані.
 * actor: { id: number; role: string } — той, хто викликає операцію (req.user)
 * userId: id акаунта, який треба видалити
 *
 * Політика: дозволено, якщо actor.id === userId (видаляє свій акаунт) або actor.role === 'ADMIN'.
 * В іншому випадку кидаємо помилку з code = 'FORBIDDEN'.
 */
export async function deleteProfileAndAllData(actor: { id: number; role: string }, userId: number) {
  try {
    // Перевірка авторизації — тільки власник або ADMIN можуть видаляти акаунт
    if (!(actor && (actor.id === userId || actor.role === 'ADMIN'))) {
      const err: any = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Переконаємось, що користувач існує
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) return { success: false, error: 'User not found' };

    // Знайдемо всі новели автора і їхні глави
    const novels = await prisma.novel.findMany({ where: { authorId: userId }, select: { id: true } });
    const novelIds = novels.map(n => n.id);
    let chapterIds: number[] = [];
    if (novelIds.length > 0) {
      const chapters = await prisma.chapter.findMany({ where: { novelId: { in: novelIds } }, select: { id: true } });
      chapterIds = chapters.map(c => c.id);
    }

    // Знайдемо всі коментарі, створені користувачем (щоб очистити replies->parentId)
    const userComments = await prisma.comment.findMany({ where: { userId }, select: { id: true } });
    const userCommentIds = userComments.map(c => c.id);

    // Побудуємо масив операцій для транзакції — додаємо умовно в залежності від наявності id-ів
    const ops: any[] = [];

    // Видалити/очистити notifications пов'язані з користувачем (actor або owner)
    ops.push(prisma.notification.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } }));

    // Видалити історію переглядів користувача
    ops.push(prisma.viewHistory.deleteMany({ where: { userId } }));

    // Видалити рейтинги, підписки (follows) де user є автором підписки
    ops.push(prisma.rating.deleteMany({ where: { userId } }));
    ops.push(prisma.follow.deleteMany({ where: { userId } }));

    // Видалити записи userFollow де user є follower або author
    ops.push(prisma.userFollow.deleteMany({ where: { OR: [{ followerId: userId }, { authorId: userId }] } }));

    // Обробка коментарів: очистити parentId у відповідей на коментарі користувача (щоб не залишити FK)
    if (userCommentIds.length > 0) {
      ops.push(prisma.comment.updateMany({
        where: { parentId: { in: userCommentIds } },
        data: { parentId: null },
      }));
      // Видалити самі коментарі користувача
      ops.push(prisma.comment.deleteMany({ where: { id: { in: userCommentIds } } }));
    }

    // Видалити звіти, створені користувачем
    ops.push(prisma.report.deleteMany({ where: { reporterId: userId } }));

    // Для звітів, які оброблені цим користувачем — зняти moderatorId
    ops.push(prisma.report.updateMany({ where: { moderatorId: userId }, data: { moderatorId: null } }));

    // Для новел автора — видалити всі залежності (тільки якщо є novelIds)
    if (novelIds.length > 0) {
      // Видалити коментарі, які прив'язані до цих новел (включно з коментарями до глав — нижче)
      ops.push(prisma.comment.deleteMany({ where: { novelId: { in: novelIds } } }));

      // Видалити рейтинги прив'язані до цих новел
      ops.push(prisma.rating.deleteMany({ where: { novelId: { in: novelIds } } }));

      // Видалити підписки на ці новели
      ops.push(prisma.follow.deleteMany({ where: { novelId: { in: novelIds } } }));

      // Видалити зв'язки з тегами
      ops.push(prisma.novelTag.deleteMany({ where: { novelId: { in: novelIds } } }));

      // Видалити перегляди прив'язані до новел
      ops.push(prisma.viewHistory.deleteMany({ where: { novelId: { in: novelIds } } }));
    }

    // Для глав — видалити всі залежності (тільки якщо є chapterIds)
    if (chapterIds.length > 0) {
      // Видалити коментарі по цим главам
      ops.push(prisma.comment.deleteMany({ where: { chapterId: { in: chapterIds } } }));

      // Видалити перегляди по цим главам
      ops.push(prisma.viewHistory.deleteMany({ where: { chapterId: { in: chapterIds } } }));
    }

    // Видалити модераційні звіти пов'язані із цими цілями (novel/chapter)
    if (novelIds.length > 0 || chapterIds.length > 0) {
      const reportOrWhere: any[] = [];
      if (novelIds.length > 0) reportOrWhere.push({ AND: [{ targetType: 'novel' }, { targetId: { in: novelIds } }] });
      if (chapterIds.length > 0) reportOrWhere.push({ AND: [{ targetType: 'chapter' }, { targetId: { in: chapterIds } }] });
      if (reportOrWhere.length > 0) {
        ops.push(prisma.report.deleteMany({ where: { OR: reportOrWhere } }));
      }
      // NOTE: ModerationTask видалено з проєкту — нічого з ним не робимо тут
    }

    // Видалити самі глави і новели (спочатку глави, потім новели)
    if (novelIds.length > 0) {
      if (chapterIds.length > 0) {
        ops.push(prisma.chapter.deleteMany({ where: { id: { in: chapterIds } } }));
      }
      ops.push(prisma.novel.deleteMany({ where: { id: { in: novelIds } } }));
    }

    // Нарешті — видаляємо користувача
    ops.push(prisma.user.delete({ where: { id: userId } }));

    // Виконаємо все в транзакції
    await prisma.$transaction(ops);

    // TODO: Інвалідувати сесії / refresh tokens в auth-сервісі (якщо є)
    // await authService.invalidateUserSessions(userId);

    return { success: true };
  } catch (err: any) {
    if (err?.code === 'FORBIDDEN') {
      // пробрасываем помилку для контролера, щоб повернути 403
      throw err;
    }
    // Логування помилки може бути корисним
    console.error('Failed to fully delete user and data:', err);
    return { success: false, error: err.message ?? 'Failed to delete user' };
  }
}
