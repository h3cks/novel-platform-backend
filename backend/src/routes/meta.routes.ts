// backend/src/routes/meta.routes.ts
import express from 'express';
import * as tagCtrl from '../controllers/tag.controller';
import * as genreCtrl from '../controllers/genre.controller';

const router = express.Router();

// GET /tags?query=...&limit=...
router.get('/tags', tagCtrl.searchTags);

// GET /genres?q=...
router.get('/genres', genreCtrl.listGenres);

export default router;
