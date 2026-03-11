import prisma from '../prisma/client';
import { countWordsFromHtml, sanitizeContent, stripHtml } from '../utils/text';
import { notifyNovelAndAuthorFollowers } from './notification.service';
import * as notificationService from './notification.service';
import * as cfg from '../config';
import * as env from '../.env';

// config / defaults
const MIN_WORDS_PER_CHAPTER_EFFECTIVE = Number(cfg.MIN_WORDS_PER_CHAPTER ?? process.env.MIN_WORDS_PER_CHAPTER ?? 100);
const DUPLICATE_CONTENT_THRESHOLD = Number(cfg.DUPLICATE_CONTENT_THRESHOLD ?? process.env.DUPLICATE_CONTENT_THRESHOLD ?? 0.6);
const MAX_COMPARE_CHAPTERS = Number(cfg.MAX_COMPARE_CHAPTERS ?? process.env.MAX_COMPARE_CHAPTERS ?? 50);
const MAX_EXTERNAL_LINKS = Number(cfg.MAX_EXTERNAL_LINKS ?? process.env.MAX_EXTERNAL_LINKS ?? 5);

const LANG_DETECTION_ENABLED = (cfg.LANG_DETECTION_ENABLED ?? process.env.LANG_DETECTION_ENABLED ?? 'false') === 'true';
const LANG_DETECTION_RATIO = Number(cfg.LANG_DETECTION_RATIO ?? process.env.LANG_DETECTION_RATIO ?? 0.6);

/** helper: extract links & domain */
function extractLinksFromHtml(html: string): string[] {
  const matches = html.match(/https?:\/\/[^\s"'<>]+/gi);
  return matches ?? [];
}

function domainOfUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Алгоритм шинглів: розбиває текст на набори з k слів для пошуку плагіату/дублікатів.
 * * @param {string} text - Вхідний текст.
 * @param {number} [k=5] - Довжина шингла.
 * @returns {Set<string>} Унікальний набір шинглів.
 */
function shingles(text: string, k = 5): Set<string> {
  const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const s = new Set<string>();
  if (words.length < k) {
    if (words.length > 0) s.add(words.join(' '));
    return s;
  }
  for (let i = 0; i <= words.length - k; i++) {
    s.add(words.slice(i, i + k).join(' '));
  }
  return s;
}

/**
 * Індекс Жаккара: обчислює коефіцієнт подібності між двома множинами (шинглами).
 * * @param {Set<string>} a - Перша множина шинглів.
 * @param {Set<string>} b - Друга множина шинглів.
 * @returns {number} Коефіцієнт від 0 до 1 (1 = повний збіг).
 */
function jaccard(a: Set<string>, b: Set<string>) {
  const A = a.size;
  const B = b.size;
  if (A === 0 && B === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = A + B - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Language heuristic: ratio of Cyrillic letters to all letters.
 */
function cyrillicRatio(text: string) {
  if (!text) return 0;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  let cyrCount = 0;
  for (const ch of letters) {
    if (/\p{Script=Cyrillic}/u.test(ch)) cyrCount++;
  }
  return cyrCount / letters.length;
}

/**
 * Дані для створення нового розділу новели.
 * @typedef {Object} CreateChapterInput
 * @property {string} title - Назва розділу.
 * @property {string} content - Контент розділу (HTML).
 */
type CreateChapterInput = {
  title: string;
  content: string;
};

/**
 * Створює новий розділ для новели.
 * * Бізнес-логіка:
 * 1. Очищує HTML від шкідливого коду.
 * 2. Перевіряє мінімальну кількість слів.
 * 3. Аналізує текст на наявність дублікатів серед останніх глав (алгоритм шинглів та індекс Жаккара).
 * 4. Перевіряє кількість унікальних зовнішніх посилань.
 * 5. Визначає мову (співвідношення кирилиці до загальної кількості літер).
 * 6. Зберігає розділ у межах транзакції та оновлює загальну кількість слів у новелі.
 * 7. Надсилає сповіщення автору (якщо контент сумнівний) та підписникам.
 * * @async
 * @param {number} novelId - Ідентифікатор новели.
 * @param {number} actorId - Ідентифікатор користувача, який створює розділ.
 * @param {CreateChapterInput} input - Дані нового розділу.
 * @returns {Promise<Object>} Створений об'єкт розділу.
 * @throws {Error} CHAPTER_TOO_SHORT, якщо текст занадто короткий.
 * @throws {Error} NOVEL_NOT_FOUND, якщо новели не існує.
 */
export async function createChapter(novelId: number, actorId: number, input: CreateChapterInput) {
  // sanitize and prepare (service-level)
  const cleanContent = sanitizeContent(input.content);
  const wordCount = countWordsFromHtml(cleanContent);

  // Per-chapter minimum
  if (wordCount < MIN_WORDS_PER_CHAPTER_EFFECTIVE) {
    const e: any = new Error(`Chapter must have at least ${MIN_WORDS_PER_CHAPTER_EFFECTIVE} words`);
    e.code = 'CHAPTER_TOO_SHORT';
    throw e;
  }

  // Duplicate detection: prepare shingles for new chapter
  const newSh = shingles(stripHtml(cleanContent), 5);

  // We'll detect duplicates among recent chapters (limit MAX_COMPARE_CHAPTERS)
  const recentChapters = await prisma.chapter.findMany({
    where: { novelId },
    orderBy: { createdAt: 'desc' },
    take: MAX_COMPARE_CHAPTERS,
    select: { id: true, content: true },
  });

  let duplicateDetected = false;
  let duplicateDetails: any = null;
  if (DUPLICATE_CONTENT_THRESHOLD > 0 && recentChapters.length > 0) {
    for (const rc of recentChapters) {
      const rcSh = shingles(stripHtml(rc.content), 5);
      const sim = jaccard(newSh, rcSh);
      if (sim >= DUPLICATE_CONTENT_THRESHOLD) {
        duplicateDetected = true;
        duplicateDetails = { existingChapterId: rc.id, similarity: sim };
        break;
      }
    }
  }

  // External domains check: we will check unique domains among recent contents + this one
  const recentContents = recentChapters.map(r => r.content);
  recentContents.unshift(cleanContent); // include new
  const allLinks = recentContents.flatMap((c) => extractLinksFromHtml(c));
  const domains = Array.from(new Set(allLinks.map(domainOfUrl).filter(Boolean)));
  const tooManyExternal = domains.length > MAX_EXTERNAL_LINKS;

  // Language detection for this chapter (per-chapter)
  let languageProblem = false;
  let languageRatio: number | null = null;
  if (LANG_DETECTION_ENABLED) {
    const plain = stripHtml(cleanContent ?? '');
    languageRatio = cyrillicRatio(plain);
    if (languageRatio < LANG_DETECTION_RATIO) {
      languageProblem = true;
    }
  }

  // transaction: create chapter, recompute totals, update novel.wordCount and possibly mark REVIEWING/flagged
  const createdChapter = await prisma.$transaction(async (tx) => {
    // advisory lock to avoid races when computing order and sums
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${novelId});`;

    const novel = await tx.novel.findUnique({ where: { id: novelId } });
    if (!novel) throw Object.assign(new Error('Novel not found'), { code: 'NOVEL_NOT_FOUND' });

    // compute next order within the tx
    const agg = await tx.chapter.aggregate({
      where: { novelId },
      _max: { order: true },
    });
    const nextOrder = (agg._max.order ?? 0) + 1;

    // create chapter
    const chapter = await tx.chapter.create({
      data: {
        novelId,
        title: input.title,
        content: cleanContent,
        wordCount,
        order: nextOrder,
      },
    });

    // recompute sum of word counts for the novel
    const sum = await tx.chapter.aggregate({
      where: { novelId },
      _sum: { wordCount: true },
    });
    const totalWords = sum._sum.wordCount ?? 0;

    // Prepare novel update: always update wordCount; if duplicate or many domains or languageProblem -> mark REVIEWING + flagged
    const novelUpdate: any = { wordCount: totalWords };
    if (duplicateDetected || tooManyExternal || languageProblem) {
      novelUpdate.status = 'REVIEWING';
      novelUpdate.flagged = true;
    }

    // Update novel
    await tx.novel.update({
      where: { id: novelId },
      data: novelUpdate,
    });

    return chapter;
  });

  // Post-transaction: send notifications / moderation alerts if needed
  if (duplicateDetected || tooManyExternal || (LANG_DETECTION_ENABLED && languageProblem)) {
    try {
      // fetch novel author to notify
      const novelAfter = await prisma.novel.findUnique({ where: { id: novelId }, select: { authorId: true, title: true } });
      const authorId = novelAfter?.authorId ?? null;

      // create a notification for author
      if (authorId) {
        const messageParts: string[] = [];
        if (duplicateDetected) messageParts.push(`Глава можливо дублює існуючий контент (схожість ${Number(duplicateDetails.similarity).toFixed(2)}).`);
        if (tooManyExternal) messageParts.push(`Знайдено багато зовнішніх доменів (${domains.length}).`);
        if (LANG_DETECTION_ENABLED && languageProblem) messageParts.push(`Мовна перевірка: текст має низьку частку кирилиці (${(languageRatio ?? 0 * 100).toFixed(1)}%).`);

        const msg = `Глава "${createdChapter.title}" помічена для перевірки: ${messageParts.join(' ')}`;

        await notificationService.createNotification({
          userId: authorId,
          type: 'CHAPTER_FLAGGED',
          targetType: 'chapter',
          targetId: createdChapter.id,
          actorId: actorId,
          message: msg,
        });
      }

      // Optionally: notify moderators (not implemented here) or create moderation task
    } catch (e) {
      console.warn('Failed to create flag notification', e);
    }
  }

  // Normal follower notification (kept as before) — best-effort
  setImmediate(() => {
    try {
      notifyNovelAndAuthorFollowers(
          novelId,
          actorId,
          `Нова глава "${createdChapter.title}"`,
          { targetType: 'chapter', targetId: createdChapter.id }
      );
    } catch (e) {
      console.warn('notify failed', e);
    }
  });

  return createdChapter;
}

/**
 * Отримує список розділів для конкретної новели з пагінацією.
 * * @async
 * @param {number} novelId - Ідентифікатор новели.
 * @param {number} [page=1] - Номер сторінки.
 * @param {number} [limit=20] - Кількість елементів на сторінку.
 * @returns {Promise<{items: Array, meta: {page: number, limit: number, total: number}}>} Список розділів та метадані пагінації.
 */
export async function listChaptersByNovel(novelId: number, page = 1, limit = 20) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  const skip = (p - 1) * l;

  const [total, items] = await Promise.all([
    prisma.chapter.count({ where: { novelId } }),
    prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: 'asc' },
      skip,
      take: l,
      select: {
        id: true,
        title: true,
        order: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    items,
    meta: { page: p, limit: l, total },
  };
}

/**
 * Отримує інформацію про розділ за його ідентифікатором, включаючи дані про новелу.
 * * @async
 * @param {number} id - Ідентифікатор розділу.
 * @returns {Promise<Object | null>} Об'єкт розділу або null.
 */
export async function getChapterById(id: number) {
  const chapter = await prisma.chapter.findUnique({
    where: { id },
    include: {
      novel: {
        select: { id: true, title: true, status: true, authorId: true },
      },
    },
  });
  return chapter;
}

/**
 * Оновлює контент або назву існуючого розділу та перераховує загальну кількість слів у новелі.
 * * @async
 * @param {number} chapterId - Ідентифікатор розділу.
 * @param {Object} data - Нові дані для оновлення.
 * @param {string} [data.title] - Нова назва розділу.
 * @param {string} [data.content] - Новий контент розділу.
 * @returns {Promise<Object | null>} Оновлений об'єкт розділу.
 */
export async function updateChapter(chapterId: number, data: { title?: string; content?: string }) {
  // sanitize if content provided
  const updates: any = {};
  if (typeof data.title !== 'undefined') updates.title = data.title;
  if (typeof data.content !== 'undefined') {
    const clean = sanitizeContent(data.content);
    const wc = countWordsFromHtml(clean);
    updates.content = clean;
    updates.wordCount = wc;
  }

  // perform update + recompute novel.wordCount in transaction
  const updated = await prisma.$transaction(async (tx) => {
    const ch = await tx.chapter.update({
      where: { id: chapterId },
      data: updates,
    });

    // recompute sum
    const sum = await tx.chapter.aggregate({
      where: { novelId: ch.novelId },
      _sum: { wordCount: true },
    });
    const totalWords = sum._sum.wordCount ?? 0;
    await tx.novel.update({
      where: { id: ch.novelId },
      data: { wordCount: totalWords },
    });

    return tx.chapter.findUnique({ where: { id: chapterId } });
  });

  return updated;
}

/**
 * Видаляє розділ та перераховує загальну кількість слів у новелі.
 * * @async
 * @param {number} chapterId - Ідентифікатор розділу для видалення.
 * @returns {Promise<{ok: boolean}>} Статус виконання.
 * @throws {Error} CH_NOT_FOUND, якщо розділ не знайдено.
 */
export async function deleteChapter(chapterId: number) {
  return prisma.$transaction(async (tx) => {
    const ch = await tx.chapter.findUnique({ where: { id: chapterId } });
    if (!ch) throw Object.assign(new Error('Chapter not