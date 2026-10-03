import path from 'node:path';
import { Rating } from '../models/Rating.js';
import { Anime } from '../models/Anime.js';
import { User } from '../models/User.js';
import { FeatureMeta } from '../models/FeatureMeta.js';
import { TrainingRun } from '../models/TrainingRun.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { trainUserModel } from '../ml/trainer.js';
import { invalidateUserModel } from '../ml/recommender.js';

// Orquestra o treino de um usuário: busca os dados no Mongo, delega o cálculo puro ao
// ml/trainer, e persiste o resultado (training_runs + users.lastTrainedAt). SPEC §12.3.
export async function trainForUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');

  const ratingsCount = await Rating.countDocuments({ userId });
  if (ratingsCount < env.MIN_RATINGS_FOR_MODEL) {
    throw new AppError(
      422,
      `Usuário precisa de pelo menos ${env.MIN_RATINGS_FOR_MODEL} avaliações para treinar o modelo.`,
      'NOT_ENOUGH_RATINGS',
      { required: env.MIN_RATINGS_FOR_MODEL, current: ratingsCount }
    );
  }

  const activeFeatureMeta = await FeatureMeta.findOne({ isActive: true }).lean();
  if (!activeFeatureMeta) {
    throw new AppError(409, 'Dataset ainda não foi importado.', 'DATASET_NOT_IMPORTED');
  }

  const ratings = await Rating.find({ userId }).lean();
  const animeIds = ratings.map((rating) => rating.animeId);
  const animes = await Anime.find({ animeId: { $in: animeIds } })
    .select('animeId features featureVersion')
    .lean();
  const animeByAnimeId = new Map(animes.map((anime) => [anime.animeId, anime]));

  const features = [];
  const scores = [];
  let staleCount = 0;

  for (const rating of ratings) {
    const anime = animeByAnimeId.get(rating.animeId);
    if (!anime || anime.featureVersion !== activeFeatureMeta.version) {
      staleCount += 1;
      continue;
    }
    features.push(anime.features);
    scores.push(rating.score);
  }

  if (staleCount > 0) {
    logger.warn(
      `${staleCount} avaliação(ões) do usuário ${userId} ignorada(s) por featureVersion desatualizada. Rode "npm run features:rebuild".`
    );
  }

  if (features.length < env.MIN_RATINGS_FOR_MODEL) {
    throw new AppError(
      422,
      `Usuário precisa de pelo menos ${env.MIN_RATINGS_FOR_MODEL} avaliações válidas para treinar o modelo.`,
      'NOT_ENOUGH_RATINGS',
      { required: env.MIN_RATINGS_FOR_MODEL, current: features.length }
    );
  }

  const modelPath = path.join(env.MODELS_DIR, `user_${userId}`);

  const result = await trainUserModel({
    features,
    scores,
    inputDim: activeFeatureMeta.inputDim,
    learningRate: env.TRAIN_LEARNING_RATE,
    epochs: env.TRAIN_EPOCHS,
    batchSize: env.TRAIN_BATCH_SIZE,
    modelPath
  });

  const trainedAt = new Date();

  await TrainingRun.create({
    userId,
    featureVersion: activeFeatureMeta.version,
    samples: features.length,
    trainSamples: result.trainSamples,
    valSamples: result.valSamples,
    epochs: result.epochs,
    finalLoss: result.finalLoss,
    valLoss: result.valLoss,
    maeScore: result.maeScore,
    rmseScore: result.rmseScore,
    durationMs: result.durationMs,
    modelPath
  });

  user.lastTrainedAt = trainedAt;
  await user.save();

  invalidateUserModel(String(userId));

  return {
    userId: String(userId),
    trainedAt,
    featureVersion: activeFeatureMeta.version,
    inputDim: activeFeatureMeta.inputDim,
    samples: features.length,
    trainSamples: result.trainSamples,
    valSamples: result.valSamples,
    epochs: result.epochs,
    epochsPlanned: result.epochsPlanned,
    earlyStopped: result.earlyStopped,
    finalLoss: result.finalLoss,
    valLoss: result.valLoss,
    maeScore: result.maeScore,
    rmseScore: result.rmseScore,
    metricsOnTrainSet: result.metricsOnTrainSet,
    durationMs: result.durationMs,
    modelPath
  };
}
