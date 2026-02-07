import { Request, Response } from 'express';
import * as tagService from '../services/tag.service';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

export const searchTags = asyncHandler(async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.query === 'string' ? req.query.query : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const tags = await tagService.searchTags(q, limit);
    return ok(res, { items: tags });
  } catch (err: any) {
    throw err;
  }
});
