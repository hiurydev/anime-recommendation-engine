import fs from 'node:fs';
import path from 'node:path';
import { User } from '../models/User.js';
import { Rating } from '../models/Rating.js';
import { TrainingRun } from '../models/TrainingRun.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { invalidateUserModel } from '../ml/recommender.js';

function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    ratingsCount: user.ratingsCount,
    lastTrainedAt: user.lastTrainedAt
  };
}

export async function createUser(name) {
  const user = await User.create({ name });
  return serializeUser(user);
}

export async function listUsers() {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return users.map(serializeUser);
}

export async function getUserOrThrow(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');
  return user;
}

export async function getUser(userId) {
  return serializeUser(await getUserOrThrow(userId));
}

export async function deleteUser(userId) {
  await getUserOrThrow(userId);

  await Rating.deleteMany({ userId });
  await TrainingRun.deleteMany({ userId });
  await User.findByIdAndDelete(userId);

  const modelDir = path.join(env.MODELS_DIR, `user_${userId}`);
  if (fs.existsSync(modelDir)) fs.rmSync(modelDir, { recursive: true, force: true });
  invalidateUserModel(userId);
}
