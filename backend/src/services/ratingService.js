import { Rating } from '../models/Rating.js';
import { Anime } from '../models/Anime.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

async function recalcRatingsCount(userId) {
  const count = await Rating.countDocuments({ userId });
  await User.findByIdAndUpdate(userId, { ratingsCount: count });
  return count;
}

export async function listRatings({ userId, page, limit }) {
  const skip = (page - 1) * limit;

  const [ratings, total] = await Promise.all([
    Rating.find({ userId }).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Rating.countDocuments({ userId })
  ]);

  const animeIds = ratings.map((rating) => rating.animeId);
  const animes = await Anime.find({ animeId: { $in: animeIds } })
    .select('animeId name type genres rating')
    .lean();
  const animeByAnimeId = new Map(animes.map((anime) => [anime.animeId, anime]));

  const data = ratings.map((rating) => {
    const anime = animeByAnimeId.get(rating.animeId);
    return {
      id: String(rating._id),
      animeId: rating.animeId,
      score: rating.score,
      anime: anime
        ? { name: anime.name, type: anime.type, genres: anime.genres, rating: anime.rating }
        : null,
      updatedAt: rating.updatedAt
    };
  });

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function upsertRating({ userId, animeId, score }) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');

  const anime = await Anime.findOne({ animeId });
  if (!anime) throw new AppError(404, 'Anime não encontrado.', 'NOT_FOUND');

  const existing = await Rating.findOne({ userId, animeId });
  let ratingDoc;
  if (existing) {
    existing.score = score;
    ratingDoc = await existing.save();
  } else {
    ratingDoc = await Rating.create({ userId, animeId, score });
  }

  await recalcRatingsCount(userId);

  return { id: String(ratingDoc._id), animeId, score, created: !existing };
}

export async function deleteRating({ userId, animeId }) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');

  await Rating.deleteOne({ userId, animeId });
  await recalcRatingsCount(userId);
}
