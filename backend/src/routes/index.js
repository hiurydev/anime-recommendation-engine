import { Router } from 'express';
import mongoose from 'mongoose';
import { createRequire } from 'module';
import { Anime } from '../models/Anime.js';
import { FeatureMeta } from '../models/FeatureMeta.js';

const require = createRequire(import.meta.url);

const router = Router();

router.get('/health', async (req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  let animeCount = 0;
  let featureVersion = null;
  try {
    animeCount = await Anime.countDocuments();
    const activeFeatureMeta = await FeatureMeta.findOne({ isActive: true });
    featureVersion = activeFeatureMeta?.version ?? null;
  } catch {
    // coleções ainda não existem antes da importação do dataset
  }

  let tfjsVersion = 'unknown';
  try {
    tfjsVersion = require('@tensorflow/tfjs-node/package.json').version;
  } catch {
    // dependência ainda não instalada/compilada
  }

  res.json({ status: 'ok', mongo: mongoState, animeCount, featureVersion, tfjs: tfjsVersion });
});

export default router;
