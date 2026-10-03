import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1, 'MONGO_URI é obrigatória'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATASET_PATH: z.string().default('/app/data/anime.csv'),
  MODELS_DIR: z.string().default('/app/models'),
  MIN_RATINGS_FOR_MODEL: z.coerce.number().int().positive().default(5),
  TRAIN_EPOCHS: z.coerce.number().int().positive().default(120),
  TRAIN_BATCH_SIZE: z.coerce.number().int().positive().default(8),
  TRAIN_LEARNING_RATE: z.coerce.number().positive().default(0.01),
  RECOMMENDATION_MIN_MEMBERS: z.coerce.number().int().nonnegative().default(5000),
  USE_SYNTHETIC_NEGATIVES: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuração de ambiente inválida:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
