// src/tests/report.service.test.ts
/**
 * Tests for report.service
 */

jest.mock('../prisma/client', () => require('../__mocks__/prisma/client'));

beforeEach(() => {
  jest.resetModules();
  jest.resetAllMocks();
});

describe('report.service', () => {
  test('createReport creates report when novel exists and no duplicate open report', async () => {
    const prisma: any = require('../prisma/client');
    prisma.novel.findUnique.mockResolvedValueOnce({ id: 11, title: 'SomeNovel' });
    prisma.report.findFirst.mockResolvedValueOnce(null);
    prisma.report.create.mockResolvedValueOnce({ id: 123, reporterId: 7, targetId: 11, targetType: 'novel' });

    const reportService = require('../services/report.service');
    const input = { reporterId: 7, targetType: 'novel', targetId: 11, reason: 'spam' };
    const created = await reportService.createReport(input);
    expect(created).toBeDefined();
    expect(prisma.report.create).toHaveBeenCalled();
  });

  test('createReport returns error when target not found', async () => {
    const prisma: any = require('../prisma/client');
    prisma.novel.findUnique.mockResolvedValueOnce(null);

    const reportService = require('../services/report.service');
    const input = { reporterId: 7, targetType: 'novel', targetId: 9999, reason: 'spam' };
    await expect(reportService.createReport(input)).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND' });
  });
});
