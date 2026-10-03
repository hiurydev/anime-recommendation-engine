// Remove todos os modelos treinados salvos em MODELS_DIR (diretórios user_<id>).
// Necessário depois de um "npm run import -- --drop" ou de um "npm run features:rebuild",
// já que mudanças no feature_meta invalidam modelos salvos com um inputDim diferente.

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

function main() {
  if (!fs.existsSync(env.MODELS_DIR)) {
    console.log(`Diretório de modelos não existe: ${env.MODELS_DIR}`);
    return;
  }

  const entries = fs.readdirSync(env.MODELS_DIR).filter((entry) => entry.startsWith('user_'));

  for (const entry of entries) {
    fs.rmSync(path.join(env.MODELS_DIR, entry), { recursive: true, force: true });
  }

  console.log(`${entries.length} modelo(s) removido(s) de ${env.MODELS_DIR}`);
}

main();
