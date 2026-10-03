import * as ratingService from '../services/ratingService.js';

export async function list(req, res, next) {
  try {
    const result = await ratingService.listRatings(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function upsert(req, res, next) {
  try {
    const result = await ratingService.upsertRating(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await ratingService.deleteRating(req.query);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
