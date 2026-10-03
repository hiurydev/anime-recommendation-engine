import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { objectIdSchema } from '../utils/zodHelpers.js';
import * as ratingController from '../controllers/ratingController.js';

const router = Router();

const listQuerySchema = z.object({
  userId: objectIdSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

router.get('/', validate({ query: listQuerySchema }), ratingController.list);

const upsertBodySchema = z.object({
  userId: objectIdSchema,
  animeId: z.number().int(),
  score: z.number().int().min(1).max(10)
});

router.put('/', validate({ body: upsertBodySchema }), ratingController.upsert);

const deleteQuerySchema = z.object({
  userId: objectIdSchema,
  animeId: z.coerce.number().int()
});

router.delete('/', validate({ query: deleteQuerySchema }), ratingController.remove);

export default router;
