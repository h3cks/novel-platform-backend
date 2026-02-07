// backend/src/tests/profile.service.test.ts
jest.mock('../prisma/client', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), delete: jest.fn() },
    novel: { findMany: jest.fn(), deleteMany: jest.fn() },
    chapter: { findMany: jest.fn(), deleteMany: jest.fn() },
    comment: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    viewHistory: { deleteMany: jest.fn() },
    rating: { deleteMany: jest.fn() },
    follow: { deleteMany: jest.fn() },
    userFollow: { deleteMany: jest.fn() },
    report: { deleteMany: jest.fn(), updateMany: jest.fn() },
    novelTag: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import prisma from '../prisma/client';
import { deleteProfileAndAllData } from '../services/profile.service';

const mockPrisma: any = prisma;

describe('profile.service.deleteProfileAndAllData', () => {
  beforeEach(() => {
    jest.resetAllMocks();      // повністю скидає всі mock-імплементації
    jest.restoreAllMocks();    // відновлює spy (якщо використовуєте)
  });

  test('forbidden if actor is not owner or admin', async () => {
    const actor = { id: 2, role: 'READER' };
    const targetId = 3;
    await expect(deleteProfileAndAllData(actor as any, targetId)).rejects.toHaveProperty('code', 'FORBIDDEN');
  });

  test('owner can delete own account (happy path)', async () => {
    const actor = { id: 5, role: 'READER' };
    const targetId = 5;

    // setup minimal DB responses
    mockPrisma.user.findUnique.mockResolvedValue({ id: targetId });
    mockPrisma.novel.findMany.mockResolvedValue([]); // no novels
    mockPrisma.comment.findMany.mockResolvedValue([]); // no comments

    // mock all deleteMany/updateMany to resolve
    mockPrisma.notification.deleteMany.mockResolvedValue({});
    mockPrisma.viewHistory.deleteMany.mockResolvedValue({});
    mockPrisma.rating.deleteMany.mockResolvedValue({});
    mockPrisma.follow.deleteMany.mockResolvedValue({});
    mockPrisma.userFollow.deleteMany.mockResolvedValue({});
    mockPrisma.comment.updateMany.mockResolvedValue({});
    mockPrisma.comment.deleteMany.mockResolvedValue({});
    mockPrisma.report.deleteMany.mockResolvedValue({});
    mockPrisma.report.updateMany.mockResolvedValue({});
    mockPrisma.novelTag.deleteMany.mockResolvedValue({});
    mockPrisma.chapter.deleteMany.mockResolvedValue({});
    mockPrisma.novel.deleteMany.mockResolvedValue({});
    mockPrisma.user.delete.mockResolvedValue({});

    // $transaction should resolve
    mockPrisma.$transaction.mockResolvedValue([]);

    const res = await deleteProfileAndAllData(actor as any, targetId);
    expect(res).toEqual({ success: true });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: targetId }, select: { id: true } });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  test('admin can delete another user', async () => {
    const actor = { id: 1, role: 'ADMIN' };
    const targetId = 9;
    mockPrisma.user.findUnique.mockResolvedValue({ id: targetId });
    mockPrisma.novel.findMany.mockResolvedValue([]);
    mockPrisma.comment.findMany.mockResolvedValue([]);
    mockPrisma.notification.deleteMany.mockResolvedValue({});
    mockPrisma.$transaction.mockResolvedValue([]);

    const res = await deleteProfileAndAllData(actor as any, targetId);
    expect(res).toEqual({ success: true });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
