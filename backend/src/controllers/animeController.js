import * as animeService from '../services/animeService.js';

export async function list(req, res, next) {
  try {
    const { search, genres, type, minRating, sort, order, page, limit, userId } = req.query;
    const result = await animeService.listAnimes({
      search,
      genres: genres ? genres.split(',').map((genre) => genre.trim()).filter(Boolean) : undefined,
      type,
      minRating,
      sort,
      order: order ?? (sort === 'name' ? 'asc' : 'desc'),
      page,
      limit,
      userId
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function detail(req, res, next) {
  try {
    const anime = await animeService.getAnimeByAnimeId(req.params.animeId, {
      includeFeatures: req.query.includeFeatures === true
    });
    res.json(anime);
  } catch (err) {
    next(err);
  }
}
