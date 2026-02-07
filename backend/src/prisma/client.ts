import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

export default prisma;

;(module as any).exports = prisma;
;(module as any).exports.default = prisma;