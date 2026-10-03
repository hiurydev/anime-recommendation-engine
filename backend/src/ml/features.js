// Engenharia de features: transforma animes "limpos" em vetores numéricos consumíveis
// pela rede neural. O layout do vetor e as regras de normalização seguem a SPEC §11.

// Ordem fixa (não derivada dos dados) para estabilidade entre importações.
export const TYPE_VOCAB = ['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music', 'Unknown'];

// Número de posições numéricas/flags ao final do vetor: episodesNorm, ratingNorm,
// membersNorm, hasEpisodes, hasRating.
const NUMERIC_SLOTS = 5;

function minMaxOf(values) {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function medianOf(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Normalização min-max clampada em [0, 1]. Retorna 0 quando min === max (feature constante),
// o que protege contra divisão por zero em datasets degenerados.
export function minMaxNormalize(value, min, max) {
  if (max === min) return 0;
  const normalized = (value - min) / (max - min);
  return Math.min(1, Math.max(0, normalized));
}

export function buildGenreVocab(animes) {
  const genres = new Set();
  for (const anime of animes) {
    for (const genre of anime.genres ?? []) genres.add(genre);
  }
  return [...genres].sort((a, b) => a.localeCompare(b));
}

// Calcula o "dicionário" de features: vocabulários e parâmetros de normalização,
// usados tanto na importação quanto, depois, no treino/inferência (via feature_meta salvo).
export function buildFeatureMeta(animes, { version = 1 } = {}) {
  const genreVocab = buildGenreVocab(animes);
  const typeVocab = TYPE_VOCAB;

  const episodesLog = animes
    .filter((anime) => anime.episodes != null)
    .map((anime) => Math.log1p(anime.episodes));
  const ratings = animes.filter((anime) => anime.rating != null).map((anime) => anime.rating);
  const membersLog = animes.map((anime) => Math.log1p(anime.members ?? 0));

  const numeric = {
    episodes: minMaxOf(episodesLog),
    rating: { ...minMaxOf(ratings), median: medianOf(ratings) },
    members: minMaxOf(membersLog)
  };

  const inputDim = genreVocab.length + typeVocab.length + NUMERIC_SLOTS;

  return {
    version,
    genreVocab,
    typeVocab,
    numeric,
    inputDim,
    animeCount: animes.length,
    isActive: true
  };
}

// Monta o vetor de features de um anime segundo o layout exato da SPEC §11.2:
// [multi-hot gêneros][one-hot tipo][episodesNorm][ratingNorm][membersNorm][hasEpisodes][hasRating]
export function computeAnimeFeatures(anime, featureMeta) {
  const { genreVocab, typeVocab, numeric } = featureMeta;
  const genreCount = genreVocab.length;
  const typeCount = typeVocab.length;
  const vector = new Array(genreCount + typeCount + NUMERIC_SLOTS).fill(0);

  for (const genre of anime.genres ?? []) {
    const index = genreVocab.indexOf(genre);
    if (index !== -1) vector[index] = 1;
  }

  const typeIndex = typeVocab.indexOf(anime.type ?? 'Unknown');
  const fallbackTypeIndex = typeVocab.indexOf('Unknown');
  vector[genreCount + (typeIndex !== -1 ? typeIndex : fallbackTypeIndex)] = 1;

  const hasEpisodes = anime.episodes != null ? 1 : 0;
  const hasRating = anime.rating != null ? 1 : 0;

  const episodesNorm =
    anime.episodes != null
      ? minMaxNormalize(Math.log1p(anime.episodes), numeric.episodes.min, numeric.episodes.max)
      : 0;

  const ratingValue = anime.rating != null ? anime.rating : numeric.rating.median;
  const ratingNorm = minMaxNormalize(ratingValue, numeric.rating.min, numeric.rating.max);

  const membersNorm = minMaxNormalize(
    Math.log1p(anime.members ?? 0),
    numeric.members.min,
    numeric.members.max
  );

  const numericOffset = genreCount + typeCount;
  vector[numericOffset] = episodesNorm;
  vector[numericOffset + 1] = ratingNorm;
  vector[numericOffset + 2] = membersNorm;
  vector[numericOffset + 3] = hasEpisodes;
  vector[numericOffset + 4] = hasRating;

  return vector;
}
