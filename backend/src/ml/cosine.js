// Baseline de cold start: sem rede neural, apenas álgebra linear. Usado quando o usuário
// ainda não tem avaliações suficientes para treinar (ou nunca treinou). SPEC §12.6.

// Perfil do usuário = média dos vetores de features dos animes avaliados, ponderada por
// (score - 5.5) — notas acima da média contam a favor, abaixo contam contra.
export function buildUserProfile(ratings, featuresByAnimeId, inputDim) {
  const profile = new Array(inputDim).fill(0);
  let weightSum = 0;

  for (const { animeId, score } of ratings) {
    const features = featuresByAnimeId.get(animeId);
    if (!features) continue;

    const weight = score - 5.5;
    for (let i = 0; i < inputDim; i++) {
      profile[i] += weight * features[i];
    }
    weightSum += Math.abs(weight);
  }

  if (weightSum === 0) return profile;
  return profile.map((value) => value / weightSum);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Mapeia cosseno [-1, 1] para a escala de nota [1, 10].
export function cosineToScore(cosine) {
  const score = ((cosine + 1) / 2) * 9 + 1;
  return Math.round(score * 100) / 100;
}
