// Importa backend/data/anime.csv (Kaggle) para o MongoDB, calculando o feature_meta e o
// vetor de features de cada anime. Algoritmo descrito na SPEC §10.1.
//
// Uso: npm run import [-- --drop] [--file=/app/data/anime.csv]

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Anime } from '../models/Anime.js';
import { FeatureMeta } from '../models/FeatureMeta.js';
import { buildFeatureMeta, computeAnimeFeatures } from '../ml/features.js';
import {
  cleanName,
  parseAnimeId,
  parseEpisodes,
  parseGenres,
  parseMembers,
  parseRating,
  parseType
} from '../utils/parse.js';

const BATCH_SIZE = 1000;

function parseArgs(argv) {
  const args = { drop: false, file: env.DATASET_PATH };
  for (const arg of argv) {
    if (arg === '--drop') args.drop = true;
    else if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length);
  }
  return args;
}

function clearModelsDir(modelsDir) {
  if (!fs.existsSync(modelsDir)) return;
  for (const entry of fs.readdirSync(modelsDir)) {
    if (entry.startsWith('user_')) {
      fs.rmSync(path.join(modelsDir, entry), { recursive: true, force: true });
    }
  }
}

function readCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function cleanRows(rawRows) {
  const seenIds = new Set();
  const cleaned = [];
  const skipped = { invalidId: 0, emptyName: 0, duplicateId: 0 };

  for (const row of rawRows) {
    const animeId = parseAnimeId(row.anime_id);
    if (animeId === null) {
      skipped.invalidId += 1;
      continue;
    }
    if (seenIds.has(animeId)) {
      skipped.duplicateId += 1;
      continue;
    }
    const name = cleanName(row.name);
    if (!name) {
      skipped.emptyName += 1;
      continue;
    }

    seenIds.add(animeId);
    cleaned.push({
      animeId,
      name,
      nameLower: name.toLowerCase(),
      genres: parseGenres(row.genre),
      type: parseType(row.type),
      episodes: parseEpisodes(row.episodes),
      rating: parseRating(row.rating),
      members: parseMembers(row.members)
    });
  }

  return { cleaned, skipped };
}

async function persistAnimes(cleanedAnimes, featureMeta) {
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < cleanedAnimes.length; i += BATCH_SIZE) {
    const batch = cleanedAnimes.slice(i, i + BATCH_SIZE);
    const operations = batch.map((anime) => ({
      updateOne: {
        filter: { animeId: anime.animeId },
        update: {
          $set: {
            ...anime,
            features: computeAnimeFeatures(anime, featureMeta),
            featureVersion: featureMeta.version
          }
        },
        upsert: true
      }
    }));

    const result = await Anime.bulkWrite(operations);
    inserted += result.upsertedCount;
    updated += result.modifiedCount;
  }

  return { inserted, updated };
}

function printReport({ totalRead, inserted, updated, skipped, featureMeta, durationMs }) {
  const totalSkipped = skipped.invalidId + skipped.emptyName + skipped.duplicateId;

  console.log('\n--- Relatório de importação ---');
  console.log(`Linhas lidas:          ${totalRead}`);
  console.log(`Inseridos:             ${inserted}`);
  console.log(`Atualizados:           ${updated}`);
  console.log(`Descartados:           ${totalSkipped}`);
  console.log(`  - anime_id inválido:   ${skipped.invalidId}`);
  console.log(`  - nome vazio:          ${skipped.emptyName}`);
  console.log(`  - anime_id duplicado:  ${skipped.duplicateId}`);
  console.log(`Gêneros distintos:     ${featureMeta.genreVocab.length}`);
  console.log(`inputDim:              ${featureMeta.inputDim}`);
  console.log(`Duração:               ${durationMs} ms`);
}

async function main() {
  const { drop, file } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(file)) {
    console.error(`Arquivo não encontrado: ${file}`);
    console.error('Baixe o dataset do Kaggle e copie anime.csv para ./data/anime.csv.');
    console.error('Veja data/README.md ou https://www.kaggle.com/datasets/CooperUnion/anime-recommendations-database');
    process.exit(1);
  }

  await connectDatabase();

  if (drop) {
    logger.info('Removendo dados existentes (--drop)...');
    await Anime.deleteMany({});
    await FeatureMeta.deleteMany({});
    clearModelsDir(env.MODELS_DIR);
  }

  const startedAt = Date.now();
  const rawRows = await readCsvRows(file);
  const { cleaned, skipped } = cleanRows(rawRows);

  const latest = await FeatureMeta.findOne().sort({ version: -1 });
  const nextVersion = (latest?.version ?? 0) + 1;
  const featureMetaData = buildFeatureMeta(cleaned, { version: nextVersion });

  await FeatureMeta.updateMany({ isActive: true }, { $set: { isActive: false } });
  const featureMeta = await FeatureMeta.create(featureMetaData);

  const { inserted, updated } = await persistAnimes(cleaned, featureMeta);

  printReport({
    totalRead: rawRows.length,
    inserted,
    updated,
    skipped,
    featureMeta,
    durationMs: Date.now() - startedAt
  });

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  logger.error('Falha na importação do dataset', err);
  process.exit(1);
});
