// Recalcula feature_meta e os campos `features` de todos os animes, sem reimportar o CSV.
// Deve ser usado quando a engenharia de features mudar (SPEC §10.3). Depois de rodar,
// `inputDim` pode ter mudado, invalidando todos os modelos salvos: rode `npm run models:clear`.

import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Anime } from '../models/Anime.js';
import { FeatureMeta } from '../models/FeatureMeta.js';
import { buildFeatureMeta, computeAnimeFeatures } from '../ml/features.js';

const BATCH_SIZE = 1000;

async function main() {
  await connectDatabase();

  const startedAt = Date.now();
  const animes = await Anime.find().select('animeId genres type episodes rating members').lean();

  if (animes.length === 0) {
    console.error('Nenhum anime encontrado. Rode "npm run import" antes de recalcular as features.');
    await disconnectDatabase();
    process.exit(1);
  }

  const latest = await FeatureMeta.findOne().sort({ version: -1 });
  const nextVersion = (latest?.version ?? 0) + 1;
  const featureMetaData = buildFeatureMeta(animes, { version: nextVersion });

  await FeatureMeta.updateMany({ isActive: true }, { $set: { isActive: false } });
  const featureMeta = await FeatureMeta.create(featureMetaData);

  let updated = 0;
  for (let i = 0; i < animes.length; i += BATCH_SIZE) {
    const batch = animes.slice(i, i + BATCH_SIZE);
    const operations = batch.map((anime) => ({
      updateOne: {
        filter: { animeId: anime.animeId },
        update: {
          $set: {
            features: computeAnimeFeatures(anime, featureMeta),
            featureVersion: featureMeta.version
          }
        }
      }
    }));
    const result = await Anime.bulkWrite(operations);
    updated += result.modifiedCount;
  }

  const durationMs = Date.now() - startedAt;

  console.log('\n--- Relatório de recálculo de features ---');
  console.log(`Animes processados:    ${animes.length}`);
  console.log(`Atualizados:           ${updated}`);
  console.log(`Nova versão:           ${featureMeta.version}`);
  console.log(`Gêneros distintos:     ${featureMeta.genreVocab.length}`);
  console.log(`inputDim:              ${featureMeta.inputDim}`);
  console.log(`Duração:               ${durationMs} ms`);
  console.log('\nAtenção: inputDim pode ter mudado. Rode "npm run models:clear" para invalidar');
  console.log('os modelos treinados anteriormente antes de treinar novamente.');

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  logger.error('Falha ao recalcular feature_meta', err);
  process.exit(1);
});
