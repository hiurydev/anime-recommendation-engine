import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { objectIdSchema } from '../utils/zodHelpers.js';
import * as recommendationController from '../controllers/recommendationController.js';

const router = Router();

router.post(
  '/train',
  validate({ body: z.object({ userId: objectIdSchema }) }),
  recommendationController.train
);

const recommendQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  strategy: z.enum(['cosine', 'neural']).optional()
});

router.get(
  '/:userId',
  validate({ params: z.object({ userId: objectIdSchema }), query: recommendQuerySchema }),
  recommendationController.recommend
);

router.get(
  '/:userId/profile',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  recommendationController.profile
);

router.delete(
  '/:userId/model',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  recommendationController.deleteModel
);

export default router;
