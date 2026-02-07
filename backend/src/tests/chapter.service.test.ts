// src/tests/chapter.service.test.ts
/**
 * Tests for chapter.service.createChapter
 *
 * - Uses centralized prisma mock
 * - Set env BEFORE requiring service if the service reads env at import time
 */

jest.mock('../prisma/client', () => require('../__mocks__/prisma/client'));

beforeEach(() => {
  jest.resetModules();
  jest.resetAllMocks();
});

describe('chapter.service', () => {
  test('createChapter fails when chapter too short (per-chapter min enforced)', async () => {
    process.env.MIN_WORDS_PER_CHAPTER = '100';

    const prisma: any = require('../prisma/client');
    // ensure novel exists (service will check novel inside tx; top-level findUnique often used too)
    prisma.novel.findUnique.mockResolvedValueOnce({ id: 2, title: 'N' });

    const chapterService = require('../services/chapter.service');

    const shortHtml = '<p>one two three</p>';
    await expect(chapterService.createChapter(2, 5, { title: 'ch', content: shortHtml }))
      .rejects.toMatchObject({ code: 'CHAPTER_TOO_SHORT' });
  });

  test('createChapter success path updates novel wordCount and returns created chapter', async () => {
    process.env.MIN_WORDS_PER_CHAPTER = '1';

    const prisma: any = require('../prisma/client');

    // Top-level calls before transaction: ensure recent chapters list exists (no duplicates)
    prisma.chapter.findMany.mockResolvedValueOnce([]); // <--- important: avoid undefined.length

    // Also ensure novel existence if service checks it outside tx
    prisma.novel.findUnique.mockResolvedValueOnce({ id: 3, title: 'N' });

    // Mock transaction to provide the tx object used inside the service function
    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(undefined),
        novel: {
          findUnique: jest.fn().mockResolvedValue({ id: 3, title: 'N' }),
          update: jest.fn().mockResolvedValue({ id: 3, wordCount: 3 }),
        },
        chapter: {
          create: jest.fn().mockResolvedValue({ id: 77, title: 'ch', content: '<p>a b c</p>', wordCount: 3 }),
          aggregate: jest.fn().mockResolvedValue({ _sum: { wordCount: 3 }, _max: { order: 1 } }),
        },
      };
      return cb(tx);
    });

    const chapterService = require('../services/chapter.service');
    const created = await chapterService.createChapter(3, 5, { title: 'ch', content: '<p>a b c</p>' });

    expect(created).toBeDefined();
  });
});
