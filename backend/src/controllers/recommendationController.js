import * as trainingService from '../services/trainingService.js';
import * as recommendationService from '../services/recommendationService.js';

export async function train(req, res, next) {
  try {
    const result = await trainingService.trainForUser(req.body.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function recommend(req, res, next) {
  try {
    const { userId } = req.params;
    const { limit, strategy } = req.query;
    const result = await recommendationService.generateRecommendations(userId, { limit, strategy });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function profile(req, res, next) {
  try {
    const result = await recommendationService.getProfile(req.params.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function deleteModel(req, res, next) {
  try {
    await recommendationService.deleteUserModel(req.params.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
