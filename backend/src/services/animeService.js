import { Anime } from '../models/Anime.js';
import { Rating } from '../models/Rating.js';
import { AppError } from '../utils/AppError.js';

const SORT_FIELDS = { members: 'members', rating: 'rating', name: 'nameLower' };

export function serializeAnime(anime, { includeFeatures = false, userScore } = {}) {
  const serialized = {
    id: String(anime._id),
    animeId: anime.animeId,
    name: anime.name,
    genres: anime.genres,
    type: anime.type,
    episodes: anime.episodes,
    rating: anime.rating,
    members: anime.members
  };
  if (includeFeatures) serialized.features = anime.features;
  if (userScore !== undefined) serialized.userScore = userScore;
  return serialized;
}

export async function listAnimes({ search, genres, type, minRating, sort, order, page, limit, userId }) {
  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.nameLower = { $regex: escaped, $options: 'i' };
  }
  if (genres?.length) filter.genres = { $all: genres };
  if (type) filter.type = type;
  if (minRating != null) filter.rating = { $gte: minRating };

  const sortField = SORT_FIELDS[sort] ?? 'members';
  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Anime.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit).lean(),
    Anime.countDocuments(filter)
  ]);

  let scoresByAnimeId = new Map();
  if (userId) {
    const ratings = await Rating.find({
      userId,
      animeId: { $in: items.map((anime) => anime.animeId) }
    }).lean();
    scoresByAnimeId = new Map(ratings.map((rating) => [rating.animeId, rating.score]));
  }

  const data = items.map((anime) =>
    serializeAnime(anime, {
      userScore: userId ? scoresByAnimeId.get(anime.animeId) ?? null : undefined
    })
  );

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getAnimeByAnimeId(animeId, { includeFeatures = false } = {}) {
  const anime = await Anime.findOne({ animeId }).lean();
  if (!anime) throw new AppError(404, 'Anime não encontrado.', 'NOT_FOUND');
  return serializeAnime(anime, { includeFeatures });
}
