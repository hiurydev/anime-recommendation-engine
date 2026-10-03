import tf from '@tensorflow/tfjs-node';

// Rede pequena + L2 + dropout porque o conjunto de treino é minúsculo (5-200 exemplos por
// usuário). Saída sigmoid porque o alvo (score/10) está normalizado em [0,1]. SPEC §12.2.
export function createModel(inputDim, learningRate) {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [inputDim],
      units: 32,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    })
  );
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(
    tf.layers.dense({
      units: 16,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    })
  );
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });

  return model;
}
