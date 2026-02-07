// src/services/publish.service.ts
import prisma from '../prisma/client';
import { stripHtml, countWordsFromHtml } from '../utils/text';
import { sendMail } from './email.service';
import * as cfg from '../config';

/**
 * Utility to read numeric config with fallback and safe parsing.
 */
function getEnvNumber(...vals: Array<any>): number {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

const MIN_WORDS_TOTAL = getEnvNumber(cfg.MIN_WORDS_TOTAL, process.env.MIN_WORDS_TOTAL, 5000);
const MIN_CHAPTERS = getEnvNumber(cfg.MIN_CHAPTERS, process.env.MIN_CHAPTERS, 1);
const LANG_DETECTION_ENABLED = (cfg.LANG_DETECTION_ENABLED ?? process.env.LANG_DETECTION_ENABLED ?? 'false') === 'true';
const LANG_DETECTION_RATIO = getEnvNumber(cfg.LANG_DETECTION_RATIO, process.env.LANG_DETECTION_RATIO, 0.6);

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

type PublishCheckResult = {
  ok: boolean;
  reasons: string[]; // machine-readable keys
  details?: any;
};

/**
 * runPrePublishChecks: легкі перевірки на рівні всієї новели.
 * ВАЖЛИВО: важкі per-chapter checks (duplicate, external links, min words per chapter)
 * виконуються в chapter.service при додаванні/оновленні глави.
 */
export async function runPrePublishChecks(novelId: number): Promise<PublishCheckResult> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      chapters: true,
      author: { select: { id: true, email: true, username: true } },
      genres: { select: { genreId: true } },
      tags: { select: { tagId: true } },
    },
  });
  if (!novel) throw Object.assign(new Error('Novel not found'), { code: 'NOVEL_NOT_FOUND' });

  const reasons: string[] = [];
  const details: any = {};

  // 1) MIN_CHAPTERS
  const chapterCount = Array.isArray(novel.chapters) ? novel.chapters.length : 0;
  if (chapterCount < MIN_CHAPTERS) {
    reasons.push('min_chapters');
    details.minChapters = { required: MIN_CHAPTERS, actual: chapterCount };
  }

  // 2) MIN_WORDS_TOTAL (cached or computed)
  const totalWords =
    typeof novel.wordCount === 'number' && !Number.isNaN(novel.wordCount)
      ? Number(novel.wordCount)
      : (Array.isArray(novel.chapters) ? novel.chapters.reduce((s, c) => s + (c.wordCount ?? countWordsFromHtml(c.content ?? '')), 0) : 0);

  if (totalWords < MIN_WORDS_TOTAL) {
    reasons.push('min_words_total');
    details.minWordsTotal = { required: MIN_WORDS_TOTAL, actual: totalWords };
  }

  // 3) LANG_DETECTION (only short note if enabled) - moved heavy per-chapter detection to chapter.service
  // We keep no heavy lang detection here; optionally return a note if feature enabled
  if (LANG_DETECTION_ENABLED) {
    details.langDetection = { note: 'Per-chapter language checks are performed during chapter creation.' };
  }

  // 4) require at least 1 genre and 1 tag
  const genreCount = Array.isArray(novel.genres) ? novel.genres.length : await prisma.novelGenre.count({ where: { novelId } });
  const tagCount = Array.isArray(novel.tags) ? novel.tags.length : await prisma.novelTag.count({ where: { novelId } });

  if (genreCount < 1) {
    reasons.push('no_genre');
    details.genres = { required: 1, actual: genreCount };
  }
  if (tagCount < 1) {
    reasons.push('no_tag');
    details.tags = { required: 1, actual: tagCount };
  }

  const ok = reasons.length === 0;
  return { ok, reasons, details };
}

/**
 * attemptPublish: дозволяє публікацію тільки якщо пройдені базові перевірки:
 * - має мінімум 1 жанр та 1 тег,
 * - загальна кількість слів >= MIN_WORDS_TOTAL,
 * - мінімальна кількість глав >= MIN_CHAPTERS,
 * - опціонально — мова (перевірка переміщена до chapter.service).
 */
export async function attemptPublish(novelId: number, actorId: number) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      author: { select: { id: true, email: true, username: true } },
      genres: { select: { genreId: true } },
      tags: { select: { tagId: true } },
    },
  });

  if (!novel) throw Object.assign(new Error('Novel not found'), { code: 'NOVEL_NOT_FOUND' });

  if (novel.status === 'BLOCKED') {
    throw Object.assign(new Error('Forbidden: novel is blocked'), { code: 'FORBIDDEN' });
  }

  if (novel.authorId !== actorId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });

  // Check genres/tags presence
  const genreCount = Array.isArray(novel.genres) ? novel.genres.length : await prisma.novelGenre.count({ where: { novelId } });
  const tagCount = Array.isArray(novel.tags) ? novel.tags.length : await prisma.novelTag.count({ where: { novelId } });

  const missingReasons: string[] = [];
  const missingDetails: any = {};
  if (genreCount < 1) {
    missingReasons.push('no_genre');
    missingDetails.genres = { required: 1, actual: genreCount };
  }
  if (tagCount < 1) {
    missingReasons.push('no_tag');
    missingDetails.tags = { required: 1, actual: tagCount };
  }
  if (missingReasons.length > 0) {
    await prisma.novel.update({
      where: { id: novelId },
      data: { status: 'REVIEWING', autoPublished: false },
    });
    return {
      ok: false,
      status: 'REVIEWING',
      reasons: missingReasons,
      details: missingDetails,
    };
  }

  // Compute total words: prefer cached novel.wordCount, otherwise aggregate (light)
  let totalWords: number = 0;
  if (typeof novel.wordCount === 'number' && !Number.isNaN(novel.wordCount)) {
    totalWords = Number(novel.wordCount);
  } else {
    const agg = await prisma.chapter.aggregate({
      where: { novelId },
      _sum: { wordCount: true },
    });
    totalWords = Number(agg._sum.wordCount ?? 0);
  }

  if (totalWords < MIN_WORDS_TOTAL) {
    await prisma.novel.update({
      where: { id: novelId },
      data: { status: 'REVIEWING', autoPublished: false },
    });
    return {
      ok: false,
      status: 'REVIEWING',
      reasons: ['min_words_total'],
      details: { required: MIN_WORDS_TOTAL, actual: totalWords },
    };
  }

  // Enough words and has genre/tag -> publish
  try {
    const updated = await prisma.novel.update({
      where: { id: novelId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), autoPublished: true },
    });

    // notify author (best-effort)
    if (novel.author?.email) {
      const subject = `Ваша новела "${novel.title}" опублікована`;
      const html = `<p>Доброго дня, ${novel.author.username ?? 'Автор'}.</p>
        <p>Ваша новела "<strong>${novel.title}</strong>" успішно опублікована.</p>
        <p>Дякуємо!</p>`;
      try {
        await sendMail(novel.author.email, subject, html);
      } catch (e) {
        console.warn('Failed to send publish email', e);
      }
    }

    return { ok: true, status: 'PUBLISHED', reasons: [], details: { novel: updated } };
  } catch (e: any) {
    console.error('Failed to update novel status to PUBLISHED', e);
    throw Object.assign(new Error('DB_UPDATE_FAILED'), { code: 'DB_ERROR', details: e });
  }
}
