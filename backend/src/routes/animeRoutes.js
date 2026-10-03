import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { ANIME_TYPES } from '../models/Anime.js';
import * as animeController from '../controllers/animeController.js';

const router = Router();

const listQuerySchema = z.object({
  search: z.string().min(1).optional(),
  genres: z.string().optional(),
  type: z.enum(ANIME_TYPES).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  sort: z.enum(['members', 'rating', 'name']).default('members'),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  userId: z.string().optional()
});

router.get('/', validate({ query: listQuerySchema }), animeController.list);

const detailParamsSchema = z.object({
  animeId: z.coerce.number().int()
});

const detailQuerySchema = z.object({
  includeFeatures: z.coerce.boolean().optional()
});

router.get(
  '/:animeId',
  validate({ params: detailParamsSchema, query: detailQuerySchema }),
  animeController.detail
);

export default router;
