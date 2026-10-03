import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserProfile, cosineSimilarity, cosineToScore } from '../ml/cosine.js';

test('cosineSimilarity retorna 1 para vetores idênticos', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('cosineSimilarity retorna -1 para vetores opostos', () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity retorna 0 para vetores ortogonais', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('cosineSimilarity retorna 0 quando algum vetor é todo zero (evita divisão por zero)', () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('cosineToScore mapeia [-1,1] para [1,10]', () => {
  assert.equal(cosineToScore(-1), 1);
  assert.equal(cosineToScore(1), 10);
  assert.equal(cosineToScore(0), 5.5);
});

test('buildUserProfile pondera positivamente notas acima de 5.5 e negativamente abaixo', () => {
  const featuresByAnimeId = new Map([
    [1, [1, 0]],
    [2, [0, 1]]
  ]);
  // nota 10 no anime 1 (peso +4.5), nota 1 no anime 2 (peso -4.5)
  const ratings = [
    { animeId: 1, score: 10 },
    { animeId: 2, score: 1 }
  ];

  const profile = buildUserProfile(ratings, featuresByAnimeId, 2);
  assert.ok(profile[0] > 0, 'dimensão do anime bem avaliado deve ser positiva');
  assert.ok(profile[1] < 0, 'dimensão do anime mal avaliado deve ser negativa');
});

test('buildUserProfile ignora avaliações de animes sem vetor de features conhecido', () => {
  const featuresByAnimeId = new Map([[1, [1, 0]]]);
  const ratings = [
    { animeId: 1, score: 9 },
    { animeId: 999, score: 2 } // anime desconhecido, deve ser ignorado
  ];

  const profile = buildUserProfile(ratings, featuresByAnimeId, 2);
  assert.ok(Number.isFinite(profile[0]));
  assert.ok(Number.isFinite(profile[1]));
});

test('buildUserProfile retorna vetor neutro quando não há peso (todas as notas = 5.5)', () => {
  const featuresByAnimeId = new Map([[1, [1, 1]]]);
  // score 5 ou 6 é o mais próximo de 5.5 com inteiros; usamos soma de pesos pequena para o caso trivial
  const ratings = [];
  const profile = buildUserProfile(ratings, featuresByAnimeId, 2);
  assert.deepEqual(profile, [0, 0]);
});
