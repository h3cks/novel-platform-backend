import { Request, Response } from 'express';
import * as reportService from '../services/report.service';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

// Allowed statuses (kept local)
type ReportStatusLiteral = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED' | 'ESCALATED';
const ALLOWED_STATUS = new Set<ReportStatusLiteral>(['OPEN','IN_PROGRESS','RESOLVED','DISMISSED','ESCALATED']);

function parseStatus(input: unknown): ReportStatusLiteral | undefined {
  if (typeof input === 'undefined' || input === null) return undefined;
  if (typeof input !== 'string') return undefined;
  const up = input.toUpperCase();
  if (!ALLOWED_STATUS.has(up as ReportStatusLiteral)) return undefined;
  return up as ReportStatusLiteral;
}

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const { targetType, targetId, reason, detail } = req.body ?? {};

  if (!targetType || !targetId || !reason) {
    return fail(res, 400, 'MISSING_FIELDS', 'Missing fields (targetType, targetId, reason) required');
  }

  const tt = String(targetType).toLowerCase();
  const allowedTargets = new Set(['novel','chapter','comment','user']);
  if (!allowedTargets.has(tt)) return fail(res, 400, 'INVALID_TARGET', 'Invalid targetType');

  const tid = Number(targetId);
  if (!Number.isInteger(tid) || tid <= 0) return fail(res, 400, 'INVALID_TARGET_ID', 'Invalid targetId');

  const input = {
    reporterId: user.id,
    targetType: tt as 'novel' | 'chapter' | 'comment' | 'user',
    targetId: tid,
    reason: String(reason),
    detail: detail ? String(detail) : null,
  };

  try {
    const report = await reportService.createReport(input);
    return ok(res, { report }, undefined, 201);
  } catch (err: any) {
    if (err.code === 'INVALID_TARGET' || err.code === 'INVALID_TARGET_ID' || err.code === 'INVALID_REASON' || err.code === 'TARGET_NOT_FOUND') {
      return fail(res, 400, err.code, err.message);
    }
    if (err.code === 'TOO_MANY_REPORTS' || err.code === 'DAILY_LIMIT') {
      return fail(res, 429, err.code, err.message);
    }
    if (err.code === 'ALREADY_REPORTED') {
      return fail(res, 409, 'ALREADY_REPORTED', 'Report already exists and is not resolved/dismissed');
    }
    throw err;
  }
});

export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
  const status = parseStatus(statusRaw);
  if (statusRaw !== undefined && status === undefined) {
    return fail(res, 400, 'INVALID_STATUS', 'Invalid status filter');
  }

  const targetTypeRaw = typeof req.query.targetType === 'string' ? req.query.targetType.toLowerCase() : undefined;
  const targetType = targetTypeRaw && ['novel','chapter','comment','user'].includes(targetTypeRaw) ? (targetTypeRaw as any) : undefined;
  if (req.query.targetType && !targetType) {
    return fail(res, 400, 'INVALID_TARGET_TYPE', 'Invalid targetType filter');
  }

  const targetId = req.query.targetId ? Number(req.query.targetId) : undefined;
  if (req.query.targetId && (!Number.isInteger(targetId as number) || (targetId as number) <= 0)) {
    return fail(res, 400, 'INVALID_TARGET_ID', 'Invalid targetId filter');
  }

  const result = await reportService.listReports({
    page,
    limit,
    status,
    targetType,
    targetId: targetId ?? null,
  });

  return ok(res, result.items, result.meta);
});

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const report = await reportService.getReportById(id);
  if (!report) return fail(res, 404, 'NOT_FOUND', 'Report not found');
  return ok(res, { report });
});

export const processReport = asyncHandler(async (req: Request, res: Response) => {
  const moderator = (req as any).user;
  if (!moderator) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'INVALID_ID', 'Invalid id');

  const { status, moderatorComment, actionTaken, actionTakenNote } = req.body ?? {};
  const statusEnum = parseStatus(status);
  if (status !== undefined && statusEnum === undefined) return fail(res, 400, 'INVALID_STATUS', 'Invalid status');

  try {
    const updated = await reportService.processReport(id, moderator.id, {
      status: statusEnum,
      moderatorComment: typeof moderatorComment === 'string' ? moderatorComment : undefined,
      actionTaken: typeof actionTaken === 'string' ? actionTaken : undefined,
      actionTakenNote: typeof actionTakenNote === 'string' ? actionTakenNote : undefined,
    });
    return ok(res, { report: updated });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, 'NOT_FOUND', 'Report not found');
    if (err.code === 'INVALID_STATUS') return fail(res, 400, 'INVALID_STATUS', err.message);
    throw err;
  }
});
