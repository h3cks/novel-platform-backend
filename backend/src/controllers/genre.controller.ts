import { Request, Response } from 'express';
import * as genreService from '../services/genre.service';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

export const listGenres = asyncHandler(async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const genres = await genreService.listGenres(q);
    return ok(res, { items: genres });
  } catch (err: any) {
    throw err;
  }
});
