// src/__mocks__/prisma/client.ts
// Centralized Prisma mock used by tests.
// Provides both CommonJS and ES default shapes.

const makeMock = () => {
  const m = () => ({
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  });

  const prismaMock: any = {
    user: m(),
    novel: m(),
    chapter: m(),
    report: m(),
    comment: m(),
    novelGenre: { count: jest.fn() },
    novelTag: { count: jest.fn() },

    $transaction: jest.fn(),
    $executeRaw: jest.fn(),

    __resetAllMocks() {
      const keys = Object.keys(prismaMock);
      for (const k of keys) {
        if (k.startsWith('__')) continue;
        const val = (prismaMock as any)[k];
        if (val && typeof val === 'object') {
          for (const fn of Object.keys(val)) {
            if (typeof val[fn] === 'function' && val[fn].mockReset) {
              val[fn].mockReset();
            }
          }
        }
      }
    },
  };

  return prismaMock;
};

const prisma = makeMock();

// small console marker to confirm jest used this mock (optional, can be removed)
if (typeof global !== 'undefined' && (global as any).JEST_WORKER_ID !== undefined) {
  // eslint-disable-next-line no-console
  console.log('[PRISMA_MOCK] loaded src/__mocks__/prisma/client.ts');
}

module.exports = prisma;
module.exports.default = prisma;
