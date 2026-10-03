import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { objectIdSchema } from '../utils/zodHelpers.js';
import * as userController from '../controllers/userController.js';

const router = Router();

router.post(
  '/',
  validate({ body: z.object({ name: z.string().trim().min(2).max(40) }) }),
  userController.create
);

router.get('/', userController.list);

router.get(
  '/:userId',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  userController.detail
);

router.delete(
  '/:userId',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  userController.remove
);

export default router;
