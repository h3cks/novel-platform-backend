// src/tests/publish.service.test.ts
/**
 * Tests for publish.service (runPrePublishChecks & attemptPublish)
 * Uses centralized prisma mock.
 *
 * Important: publish.service reads env at import time, so set process.env and reset modules appropriately.
 */

jest.mock('../prisma/client', () => require('../__mocks__/prisma/client'));

beforeEach(() => {
  jest.resetModules();
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

describe('publish.service checks', () => {
  test('runPrePublishChecks fails when not enough chapters or words', async () => {
    process.env.MIN_CHAPTERS = '1';
    process.env.MIN_WORDS_TOTAL = '2000';

    const prisma: any = require('../prisma/client');
    const { runPrePublishChecks } = require('../services/publish.service');

    prisma.novel.findUnique.mockResolvedValue({
      id: 1,
      title: 'Short novel',
      author: { id: 2, email: 'a@b.com', username: 'author' },
      chapters: [],
      wordCount: 0,
      genres: [],
      tags: [],
    });

    const res = await runPrePublishChecks(1);
    expect(res.ok).toBe(false);
    expect(res.reasons).toContain('min_chapters');
  });

  test('attemptPublish publishes if checks pass', async () => {
    process.env.MIN_CHAPTERS = '0';
    process.env.MIN_WORDS_TOTAL = '0';

    const prisma: any = require('../prisma/client');
    const { attemptPublish } = require('../services/publish.service');

    const ch1 = { id: 1, content: '<p>' + 'word '.repeat(500) + '</p>', wordCount: 500 };
    const novel = {
      id: 3,
      title: 'Good',
      author: { id: 4, email: 'a@b.com', username: 'auth' },
      chapters: [ch1],
      status: 'DRAFT',
      authorId: 4,
      genres: [{ genreId: 1 }],
      tags: [{ tagId: 1 }],
      wordCount: 500,
    };

    prisma.novel.findUnique.mockResolvedValueOnce(novel);
    prisma.novel.update.mockResolvedValueOnce({ ...novel, status: 'PUBLISHED', publishedAt: new Date() });
    prisma.chapter.aggregate.mockResolvedValueOnce({ _sum: { wordCount: 500 } });

    const res = await attemptPublish(3, 4);
    expect(res.ok).toBe(true);
    expect(res.status).toBe('PUBLISHED');
    expect(prisma.novel.update).toHaveBeenCalled();
  });

  test('attemptPublish returns REVIEWING when missing genres/tags', async () => {
    process.env.MIN_CHAPTERS = '0';
    process.env.MIN_WORDS_TOTAL = '0';

    const prisma: any = require('../prisma/client');
    const { attemptPublish } = require('../services/publish.service');

    const novel = { id: 5, title: 'NoMeta', authorId: 9, author: { id: 9, email: null, username: 'a' }, genres: [], tags: [], status: 'DRAFT', wordCount: 1000 };

    prisma.novel.findUnique.mockResolvedValueOnce(novel);
    prisma.novel.update.mockResolvedValueOnce({ ...novel, status: 'REVIEWING' });

    const res = await attemptPublish(5, 9);
    expect(res.ok).toBe(false);
    expect(res.status).toBe('REVIEWING');
    expect(res.reasons.includes('no_genre') || res.reasons.includes('no_tag')).toBe(true);
  });
});
