import tf from '@tensorflow/tfjs-node';
import { createModel } from './model.js';

const SHUFFLE_SEED = 42;
const MIN_SAMPLES_FOR_VALIDATION = 20;
const MIN_VALIDATION_SAMPLES = 4;
const VALIDATION_RATIO = 0.2;
const EARLY_STOPPING_PATIENCE = 15;

// PRNG determinístico (mulberry32) para que o embaralhamento seja reprodutível entre treinos
// (RNF12). Node não tem um Math.random com seed nativo.
function mulberry32(seed) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffleIndices(length, seed) {
  const indices = Array.from({ length }, (_, i) => i);
  const random = mulberry32(seed);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function computeRegressionMetrics(predictedArray, realScores) {
  let sumAbsError = 0;
  let sumSquaredError = 0;

  for (let i = 0; i < realScores.length; i++) {
    const predicted = predictedArray[i][0] * 10;
    const real = realScores[i];
    sumAbsError += Math.abs(predicted - real);
    sumSquaredError += (predicted - real) ** 2;
  }

  return {
    maeScore: Math.round((sumAbsError / realScores.length) * 100) / 100,
    rmseScore: Math.round(Math.sqrt(sumSquaredError / realScores.length) * 100) / 100
  };
}

// Treina um modelo de regressão para um único usuário a partir de pares (features do anime,
// nota dada). Não acessa o MongoDB — recebe arrays puros e devolve métricas; a persistência
// em disco (model.save) acontece aqui pois faz parte do ciclo de treino (SPEC §12.3).
export async function trainUserModel({
  features,
  scores,
  inputDim,
  learningRate,
  epochs,
  batchSize,
  modelPath
}) {
  const startedAt = Date.now();
  const n = features.length;

  const order = seededShuffleIndices(n, SHUFFLE_SEED);
  const shuffledFeatures = order.map((i) => features[i]);
  const shuffledScores = order.map((i) => scores[i]);

  const metricsOnTrainSet = n < MIN_SAMPLES_FOR_VALIDATION;
  let valSamples = 0;
  let trainSamples = n;

  if (!metricsOnTrainSet) {
    valSamples = Math.max(MIN_VALIDATION_SAMPLES, Math.round(n * VALIDATION_RATIO));
    trainSamples = n - valSamples;
  }

  const trainFeatures = shuffledFeatures.slice(0, trainSamples);
  const trainScores = shuffledScores.slice(0, trainSamples);
  const valFeatures = shuffledFeatures.slice(trainSamples);
  const valScores = shuffledScores.slice(trainSamples);

  const model = createModel(inputDim, learningRate);

  const xTrain = tf.tensor2d(trainFeatures, [trainSamples, inputDim], 'float32');
  const yTrain = tf.tensor2d(trainScores.map((s) => s / 10), [trainSamples, 1], 'float32');

  const fitConfig = { epochs, batchSize, shuffle: true, verbose: 0 };

  let xVal = null;
  let yVal = null;
  if (valSamples > 0) {
    xVal = tf.tensor2d(valFeatures, [valSamples, inputDim], 'float32');
    yVal = tf.tensor2d(valScores.map((s) => s / 10), [valSamples, 1], 'float32');
    fitConfig.validationData = [xVal, yVal];
    fitConfig.callbacks = [tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: EARLY_STOPPING_PATIENCE })];
  }

  const history = await model.fit(xTrain, yTrain, fitConfig);
  const epochsRun = history.epoch.length;

  const evalX = valSamples > 0 ? xVal : xTrain;
  const evalScores = valSamples > 0 ? valScores : trainScores;
  const predictions = model.predict(evalX);
  const predictedArray = await predictions.array();
  const { maeScore, rmseScore } = computeRegressionMetrics(predictedArray, evalScores);

  await model.save(`file://${modelPath}`);

  const result = {
    epochs: epochsRun,
    epochsPlanned: epochs,
    earlyStopped: epochsRun < epochs,
    finalLoss: history.history.loss[epochsRun - 1],
    valLoss: valSamples > 0 ? history.history.val_loss[epochsRun - 1] : null,
    maeScore,
    rmseScore,
    trainSamples,
    valSamples,
    metricsOnTrainSet,
    durationMs: Date.now() - startedAt
  };

  tf.dispose([xTrain, yTrain, predictions]);
  if (xVal) tf.dispose([xVal, yVal]);
  model.dispose();

  return result;
}
