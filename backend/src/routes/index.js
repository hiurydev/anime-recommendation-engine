import { Router } from 'express';
import mongoose from 'mongoose';
import { createRequire } from 'module';
import { Anime } from '../models/Anime.js';
import { FeatureMeta } from '../models/FeatureMeta.js';
import animeRoutes from './animeRoutes.js';
import userRoutes from './userRoutes.js';
import ratingRoutes from './ratingRoutes.js';
import recommendationRoutes from './recommendationRoutes.js';

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

router.get('/genres', async (req, res, next) => {
  try {
    const activeFeatureMeta = await FeatureMeta.findOne({ isActive: true }).lean();
    res.json({ genres: activeFeatureMeta?.genreVocab ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get('/meta/features', async (req, res, next) => {
  try {
    const meta = await FeatureMeta.findOne({ isActive: true }).lean();
    if (!meta) {
      return res.json({ version: null, inputDim: null, genreCount: 0, typeVocab: [], numeric: null });
    }
    res.json({
      version: meta.version,
      inputDim: meta.inputDim,
      genreCount: meta.genreVocab.length,
      typeVocab: meta.typeVocab,
      numeric: meta.numeric
    });
  } catch (err) {
    next(err);
  }
});

router.use('/animes', animeRoutes);
router.use('/users', userRoutes);
router.use('/ratings', ratingRoutes);
router.use('/recommendations', recommendationRoutes);

export default router;
