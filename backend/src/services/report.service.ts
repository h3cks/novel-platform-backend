// backend/src/services/report.service.ts
import prisma from '../prisma/client';
import {
  REPORTS_PER_USER_PER_PERIOD,
  REPORTS_PERIOD_HOURS,
  MAX_REPORTS_PER_USER_PER_DAY,
} from '../config';

export type CreateReportInput = {
  reporterId: number;
  targetType: 'novel' | 'chapter' | 'comment' | 'user';
  targetId: number;
  reason: string;
  detail?: string | null;
};

// локальний literal-тип для статусів (не залежимо від @prisma/client)
export type ReportStatusLiteral = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED' | 'ESCALATED';

const ALLOWED_STATUS = new Set<ReportStatusLiteral>(['OPEN','IN_PROGRESS','RESOLVED','DISMISSED','ESCALATED']);

/**
 * Створює репорт з додатковими перевірками:
 * - перевіряє існування цілі
 * - rate-limit по періоду та добовий ліміт (якщо увімкнено)
 * - перевіряє дублікати незакритих репортів
 */
export async function createReport(input: CreateReportInput) {
  // Валідація targetType
  const allowedTargets = new Set(['novel', 'chapter', 'comment', 'user']);
  if (!allowedTargets.has(input.targetType)) {
    const e: any = new Error('Invalid targetType');
    e.code = 'INVALID_TARGET';
    throw e;
  }
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) {
    const e: any = new Error('Invalid targetId');
    e.code = 'INVALID_TARGET_ID';
    throw e;
  }
  if (!input.reason || typeof input.reason !== 'string') {
    const e: any = new Error('Invalid reason');
    e.code = 'INVALID_REASON';
    throw e;
  }

  // trim текстових полів
  const reason = String(input.reason).trim();
  const detail = typeof input.detail === 'string' ? input.detail.trim() : null;

  // Перевірити існування цілі (щоб уникнути "порожніх" репортів)
  const tid = input.targetId;
  if (input.targetType === 'novel') {
    const n = await prisma.novel.findUnique({ where: { id: tid }, select: { id: true } });
    if (!n) throw Object.assign(new Error('Novel not found'), { code: 'TARGET_NOT_FOUND' });
  } else if (input.targetType === 'chapter') {
    const ch = await prisma.chapter.findUnique({ where: { id: tid }, select: { id: true, novelId: true } });
    if (!ch) throw Object.assign(new Error('Chapter not found'), { code: 'TARGET_NOT_FOUND' });
  } else if (input.targetType === 'comment') {
    const c = await prisma.comment.findUnique({ where: { id: tid }, select: { id: true } });
    if (!c) throw Object.assign(new Error('Comment not found'), { code: 'TARGET_NOT_FOUND' });
  } else if (input.targetType === 'user') {
    const u = await prisma.user.findUnique({ where: { id: tid }, select: { id: true } });
    if (!u) throw Object.assign(new Error('User not found'), { code: 'TARGET_NOT_FOUND' });
  }

  // ===== rate-limit: reports per period =====
  try {
    const periodHours = Number(REPORTS_PERIOD_HOURS ?? 24);
    const maxPerPeriod = Number(REPORTS_PER_USER_PER_PERIOD ?? 10);

    if (maxPerPeriod > 0) {
      const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);
      const recentCount = await prisma.report.count({
        where: {
          reporterId: input.reporterId,
          createdAt: { gte: since },
        },
      });
      if (recentCount >= maxPerPeriod) {
        const e: any = new Error('Too many reports in timeframe');
        e.code = 'TOO_MANY_REPORTS';
        throw e;
      }
    }
  } catch (err) {
    // Якщо база не доступна — не блокувати користувача через падіння лічильника,
    // але логувати/пробросити можна. Тут кидаємо далі, щоб не створювати невідомі стани.
    throw err;
  }

  // ===== daily limit (optional) =====
  try {
    const dailyLimit = Number(MAX_REPORTS_PER_USER_PER_DAY ?? 0);
    if (dailyLimit > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await prisma.report.count({
        where: {
          reporterId: input.reporterId,
          createdAt: { gte: todayStart },
        },
      });
      if (todayCount >= dailyLimit) {
        const e: any = new Error('Daily report limit reached');
        e.code = 'DAILY_LIMIT';
        throw e;
      }
    }
  } catch (err) {
    throw err;
  }

  // ===== duplicate check: незакриті репорти того ж автора на ту саму ціль =====
  try {
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        // вважаємо незакритими ті, що не мають фінального статусу
        status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] },
      },
    });
    if (existing) {
      const e: any = new Error('Report already exists and is not resolved/dismissed');
      e.code = 'ALREADY_REPORTED';
      throw e;
    }
  } catch (err) {
    throw err;
  }

  // Створити репорт — НЕ вказуємо status, щоб DB встановив дефолт (ReportStatus::OPEN)
  const created = await prisma.report.create({
    data: {
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason,
      detail,
    },
  });

  return created;
}

export type ListReportsOptions = {
  page?: number;
  limit?: number;
  status?: ReportStatusLiteral | null;
  targetType?: 'novel' | 'chapter' | 'comment' | 'user' | null;
  targetId?: number | null;
};

export async function listReports(opts: ListReportsOptions = {}) {
  const p = Math.max(1, opts.page ?? 1);
  const l = Math.min(100, Math.max(1, opts.limit ?? 20));
  const skip = (p - 1) * l;

  const where: any = {};
  if (opts.status) where.status = opts.status; // Prisma client прийме literal після runtime
  if (opts.targetType) where.targetType = opts.targetType;
  if (opts.targetId) where.targetId = Number(opts.targetId);

  const [total, items] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: l,
      include: {
        reporter: { select: { id: true, username: true, displayName: true, email: true } },
        moderator: { select: { id: true, username: true, displayName: true } },
      },
    }),
  ]);

  return { items, meta: { page: p, limit: l, total } };
}

export async function getReportById(id: number) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, username: true, displayName: true, email: true } },
      moderator: { select: { id: true, username: true, displayName: true } },
    },
  });
  return report;
}

/**
 * processReport:
 * - data.status приймає local ReportStatusLiteral (validated)
 * - при виклику prisma.report.update ми приводимо status через 'as any', щоб уникнути проблем з генерованими типами клієнта
 *   (це локалізоване, безпечне приведення: перед тим ми вже валідували значення).
 */
export async function processReport(
  reportId: number,
  moderatorId: number,
  data: { status?: ReportStatusLiteral; moderatorComment?: string; actionTaken?: string; actionTakenNote?: string }
) {
  const existing = await prisma.report.findUnique({ where: { id: reportId } });
  if (!existing) throw Object.assign(new Error('Report not found'), { code: 'NOT_FOUND' });

  if (data.status !== undefined && !ALLOWED_STATUS.has(data.status)) {
    throw Object.assign(new Error('Invalid status'), { code: 'INVALID_STATUS' });
  }

  // Переконаємось, що status або undefined або валідний literal
  const statusToSet = data.status !== undefined ? data.status : existing.status;

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      // Практичний привід: statusToSet приводимо до any лише тут — бо типи Prisma можуть бути іншої форми
      status: statusToSet as any,
      moderatorComment: typeof data.moderatorComment === 'string' ? data.moderatorComment : existing.moderatorComment,
      moderatorId,
      actionTaken: typeof data.actionTaken === 'string' ? data.actionTaken : existing.actionTaken,
      actionTakenNote: typeof data.actionTakenNote === 'string' ? data.actionTakenNote : existing.actionTakenNote,
    },
  });

  return updated;
}
