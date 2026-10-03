import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGenreVocab,
  buildFeatureMeta,
  computeAnimeFeatures,
  minMaxNormalize,
  TYPE_VOCAB
} from '../ml/features.js';

const sampleAnimes = [
  { genres: ['Action', 'Comedy'], type: 'TV', episodes: 24, rating: 8.5, members: 100000 },
  { genres: ['Action', 'Drama'], type: 'Movie', episodes: null, rating: null, members: 500 },
  { genres: ['Comedy'], type: 'OVA', episodes: 2, rating: 6.0, members: 20000 }
];

test('buildGenreVocab retorna gêneros únicos ordenados alfabeticamente', () => {
  const vocab = buildGenreVocab(sampleAnimes);
  assert.deepEqual(vocab, ['Action', 'Comedy', 'Drama']);
});

test('buildFeatureMeta calcula inputDim = genreVocab + typeVocab + 5', () => {
  const meta = buildFeatureMeta(sampleAnimes, { version: 1 });
  assert.equal(meta.genreVocab.length, 3);
  assert.equal(meta.typeVocab.length, TYPE_VOCAB.length);
  assert.equal(meta.inputDim, 3 + TYPE_VOCAB.length + 5);
  assert.equal(meta.animeCount, sampleAnimes.length);
  assert.equal(meta.version, 1);
});

test('buildFeatureMeta calcula a mediana de rating apenas entre valores presentes', () => {
  const meta = buildFeatureMeta(sampleAnimes);
  // ratings presentes: 8.5 e 6.0 -> mediana = 7.25
  assert.equal(meta.numeric.rating.median, 7.25);
});

test('minMaxNormalize clampa valores fora da faixa vista no treino', () => {
  assert.equal(minMaxNormalize(5, 0, 10), 0.5);
  assert.equal(minMaxNormalize(-5, 0, 10), 0);
  assert.equal(minMaxNormalize(15, 0, 10), 1);
});

test('minMaxNormalize retorna 0 quando min === max', () => {
  assert.equal(minMaxNormalize(7, 5, 5), 0);
});

test('computeAnimeFeatures produz vetor do tamanho exato de inputDim', () => {
  const meta = buildFeatureMeta(sampleAnimes);
  for (const anime of sampleAnimes) {
    const vector = computeAnimeFeatures(anime, meta);
    assert.equal(vector.length, meta.inputDim);
  }
});

test('computeAnimeFeatures marca multi-hot de gêneros e one-hot de tipo corretamente', () => {
  const meta = buildFeatureMeta(sampleAnimes);
  const vector = computeAnimeFeatures(sampleAnimes[0], meta);

  const actionIdx = meta.genreVocab.indexOf('Action');
  const comedyIdx = meta.genreVocab.indexOf('Comedy');
  const dramaIdx = meta.genreVocab.indexOf('Drama');
  assert.equal(vector[actionIdx], 1);
  assert.equal(vector[comedyIdx], 1);
  assert.equal(vector[dramaIdx], 0);

  const typeIdx = meta.genreVocab.length + meta.typeVocab.indexOf('TV');
  assert.equal(vector[typeIdx], 1);
});

test('computeAnimeFeatures imputa episodes/rating ausentes e seta as flags correspondentes', () => {
  const meta = buildFeatureMeta(sampleAnimes);
  const vector = computeAnimeFeatures(sampleAnimes[1], meta); // sem episodes nem rating
  const G = meta.genreVocab.length;
  const T = meta.typeVocab.length;

  const episodesNorm = vector[G + T];
  const ratingNorm = vector[G + T + 1];
  const hasEpisodes = vector[G + T + 3];
  const hasRating = vector[G + T + 4];

  assert.equal(episodesNorm, 0);
  assert.equal(hasEpisodes, 0);
  assert.equal(hasRating, 0);
  // rating ausente deve usar a mediana, então ratingNorm não é necessariamente 0
  assert.equal(
    ratingNorm,
    (meta.numeric.rating.median - meta.numeric.rating.min) /
      (meta.numeric.rating.max - meta.numeric.rating.min)
  );
});

test('computeAnimeFeatures cai no tipo Unknown quando o tipo não está no vocabulário', () => {
  const meta = buildFeatureMeta(sampleAnimes);
  const vector = computeAnimeFeatures({ genres: [], type: 'Random', members: 10 }, meta);
  const unknownIdx = meta.genreVocab.length + meta.typeVocab.indexOf('Unknown');
  assert.equal(vector[unknownIdx], 1);
});

test('todos os valores do vetor ficam em [0, 1]', () => {
  const meta = buildFeatureMeta(sampleAnimes);
  for (const anime of sampleAnimes) {
    const vector = computeAnimeFeatures(anime, meta);
    for (const value of vector) {
      assert.ok(value >= 0 && value <= 1, `valor fora de [0,1]: ${value}`);
      assert.ok(Number.isFinite(value), 'valor não finito (NaN?)');
    }
  }
});
