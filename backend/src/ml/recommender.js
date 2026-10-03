import fs from 'node:fs';
import tf from '@tensorflow/tfjs-node';

// Cache em memória para não reler o disco a cada request de recomendação. Invalidado
// explicitamente sempre que um novo treino acontece ou o usuário/modelo é removido (§12.4).
const modelCache = new Map();

export function hasSavedModel(modelPath) {
  return fs.existsSync(`${modelPath}/model.json`);
}

export function invalidateUserModel(userId) {
  const cached = modelCache.get(userId);
  if (cached) {
    cached.model.dispose();
    modelCache.delete(userId);
  }
}

export async function loadUserModel(userId, modelPath) {
  const cached = modelCache.get(userId);
  if (cached) return cached.model;

  const model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
  modelCache.set(userId, { model, loadedAt: new Date() });
  return model;
}

// Roda a predição para todos os candidatos em um único batch (muito mais rápido do que
// prever um a um — SPEC §12.4 item 4).
export async function predictScores(model, candidates, inputDim) {
  const featureMatrix = candidates.map((candidate) => candidate.features);
  const xTensor = tf.tensor2d(featureMatrix, [candidates.length, inputDim], 'float32');
  const predictions = model.predict(xTensor);
  const predictedArray = await predictions.array();

  tf.dispose([xTensor, predictions]);

  return predictedArray.map((row) => row[0]);
}
