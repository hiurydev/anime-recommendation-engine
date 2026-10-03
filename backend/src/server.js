import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';

async function main() {
  await connectDatabase();

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`Backend ouvindo na porta ${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error('Falha ao iniciar o servidor', err);
  process.exit(1);
});
