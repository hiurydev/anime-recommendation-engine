import path from 'node:path';
import fs from 'node:fs';
import { User } from '../models/User.js';
import { Rating } from '../models/Rating.js';
import { Anime } from '../models/Anime.js';
import { FeatureMeta } from '../models/FeatureMeta.js';
import { TrainingRun } from '../models/TrainingRun.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { buildUserProfile, cosineSimilarity, cosineToScore } from '../ml/cosine.js';
import { loadUserModel, predictScores, invalidateUserModel, hasSavedModel } from '../ml/recommender.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TOP_GENRES_FOR_REASON = 3;
const TOP_GENRES_FOR_PROFILE = 8;
const MIN_SCORE_FOR_FAVORITE_TYPE = 7;

function modelPathFor(userId) {
  return path.join(env.MODELS_DIR, `user_${userId}`);
}

// Afinidade por gênero (§12.5): peso (score - 5.5) por avaliação, agregado por gênero e
// normalizado pelo maior peso positivo. Reaproveitado tanto no perfil de gosto quanto na
// explicação ("reason") das recomendações.
function computeTopGenres(ratings, animeByAnimeId) {
  const weightByGenre = new Map();
  const countByGenre = new Map();

  for (const rating of ratings) {
    const anime = animeByAnimeId.get(rating.animeId);
    if (!anime) continue;

    const weight = rating.score - 5.5;
    for (const genre of anime.genres ?? []) {
      weightByGenre.set(genre, (weightByGenre.get(genre) ?? 0) + weight);
      countByGenre.set(genre, (countByGenre.get(genre) ?? 0) + 1);
    }
  }

  const positiveEntries = [...weightByGenre.entries()].filter(([, weight]) => weight > 0);
  const maxWeight = positiveEntries.reduce((max, [, weight]) => Math.max(max, weight), 0);

  return positiveEntries
    .map(([genre, weight]) => ({
      genre,
      affinity: maxWeight > 0 ? Math.round((weight / maxWeight) * 100) / 100 : 0,
      count: countByGenre.get(genre) ?? 0
    }))
    .sort((a, b) => b.affinity - a.affinity);
}

function buildReason(animeGenres, topGenreNames) {
  const matched = animeGenres.filter((genre) => topGenreNames.includes(genre));
  if (matched.length === 0) return 'Perfil semelhante aos animes que você avaliou bem';
  return `Combina com seu gosto por ${matched.slice(0, 2).join(' e ')}`;
}

async function resolveStrategy({ userId, ratingsCount, forcedStrategy }) {
  const modelExists = hasSavedModel(modelPathFor(userId));

  if (forcedStrategy === 'neural') {
    if (!modelExists) {
      throw new AppError(
        409,
        'Nenhum modelo treinado para este usuário. Treine o modelo antes de usar esta estratégia.',
        'NO_MODEL_TRAINED'
      );
    }
    return 'neural-network';
  }
  if (forcedStrategy === 'cosine') return 'cosine-similarity';

  if (ratingsCount >= env.MIN_RATINGS_FOR_MODEL && modelExists) return 'neural-network';
  return 'cosine-similarity';
}

export async function generateRecommendations(userId, { limit, strategy: forcedStrategy } = {}) {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');

  const safeLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const activeFeatureMeta = await FeatureMeta.findOne({ isActive: true }).lean();
  if (!activeFeatureMeta) throw new AppError(409, 'Dataset ainda não foi importado.', 'DATASET_NOT_IMPORTED');

  const ratings = await Rating.find({ userId }).lean();
  const ratedAnimeIds = ratings.map((rating) => rating.animeId);

  const ratedAnimes = await Anime.find({ animeId: { $in: ratedAnimeIds } })
    .select('animeId genres features featureVersion')
    .lean();
  // Só usamos para perfil/cosseno os animes cujo vetor de features é da versão ativa —
  // evita misturar dimensões diferentes depois de um features:rebuild (SPEC §11.3).
  const validRatedAnimes = ratedAnimes.filter((anime) => anime.featureVersion === activeFeatureMeta.version);
  const validRatedAnimeById = new Map(validRatedAnimes.map((anime) => [anime.animeId, anime]));

  const strategy = await resolveStrategy({ userId, ratingsCount: ratings.length, forcedStrategy });

  const candidates = await Anime.find({
    animeId: { $nin: ratedAnimeIds },
    members: { $gte: env.RECOMMENDATION_MIN_MEMBERS },
    featureVersion: activeFeatureMeta.version,
    features: { $ne: [] }
  })
    .select('animeId name genres type episodes rating members features')
    .lean();

  const topGenres = computeTopGenres(ratings, validRatedAnimeById);
  const topGenreNames = topGenres.slice(0, TOP_GENRES_FOR_REASON).map((entry) => entry.genre);

  let scored;
  let modelInfo = null;

  if (strategy === 'neural-network') {
    const model = await loadUserModel(String(userId), modelPathFor(userId));
    const predictions = await predictScores(model, candidates, activeFeatureMeta.inputDim);

    scored = candidates.map((candidate, index) => ({
      candidate,
      predictedScore: Math.min(10, Math.max(1, Math.round(predictions[index] * 10 * 100) / 100))
    }));

    const latestRun = await TrainingRun.findOne({ userId }).sort({ createdAt: -1 }).lean();
    const lastRatingUpdate = await Rating.findOne({ userId }).sort({ updatedAt: -1 }).lean();
    const stale = Boolean(
      lastRatingUpdate && user.lastTrainedAt && lastRatingUpdate.updatedAt > user.lastTrainedAt
    );

    modelInfo = latestRun
      ? {
          trainedAt: user.lastTrainedAt,
          samples: latestRun.samples,
          maeScore: latestRun.maeScore,
          rmseScore: latestRun.rmseScore,
          stale
        }
      : null;
  } else {
    const featuresByAnimeId = new Map(validRatedAnimes.map((anime) => [anime.animeId, anime.features]));
    const profile = buildUserProfile(ratings, featuresByAnimeId, activeFeatureMeta.inputDim);

    scored = candidates.map((candidate) => ({
      candidate,
      predictedScore: cosineToScore(cosineSimilarity(profile, candidate.features))
    }));
  }

  scored.sort((a, b) => {
    if (b.predictedScore !== a.predictedScore) return b.predictedScore - a.predictedScore;
    return b.candidate.members - a.candidate.members;
  });

  const data = scored.slice(0, safeLimit).map(({ candidate, predictedScore }) => ({
    animeId: candidate.animeId,
    name: candidate.name,
    type: candidate.type,
    episodes: candidate.episodes,
    genres: candidate.genres,
    rating: candidate.rating,
    members: candidate.members,
    predictedScore,
    reason: buildReason(candidate.genres, topGenreNames)
  }));

  return { strategy, model: modelInfo, candidatesEvaluated: candidates.length, data };
}

export async function getProfile(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');

  const ratings = await Rating.find({ userId }).lean();
  const animeIds = ratings.map((rating) => rating.animeId);
  const animes = await Anime.find({ animeId: { $in: animeIds } })
    .select('animeId genres type')
    .lean();
  const animeByAnimeId = new Map(animes.map((anime) => [anime.animeId, anime]));

  const ratingsCount = ratings.length;
  const averageScore =
    ratingsCount > 0
      ? Math.round((ratings.reduce((sum, rating) => sum + rating.score, 0) / ratingsCount) * 100) / 100
      : 0;

  const typeCounts = new Map();
  for (const rating of ratings) {
    if (rating.score < MIN_SCORE_FOR_FAVORITE_TYPE) continue;
    const anime = animeByAnimeId.get(rating.animeId);
    if (!anime) continue;
    typeCounts.set(anime.type, (typeCounts.get(anime.type) ?? 0) + 1);
  }

  let favoriteType = null;
  let maxTypeCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxTypeCount) {
      maxTypeCount = count;
      favoriteType = type;
    }
  }

  const topGenres = computeTopGenres(ratings, animeByAnimeId).slice(0, TOP_GENRES_FOR_PROFILE);

  return { ratingsCount, averageScore, favoriteType, topGenres };
}

export async function deleteUserModel(userId) {
  const modelDir = modelPathFor(userId);
  if (fs.existsSync(modelDir)) fs.rmSync(modelDir, { recursive: true, force: true });
  invalidateUserModel(String(userId));
}
