// Helpers de limpeza/normalização das linhas cruas do anime.csv (Kaggle), aplicados na
// importação. Regras e ordem seguem a SPEC §10.2.

const HTML_ENTITIES = {
  '&quot;': '"',
  '&amp;': '&',
  '&apos;': "'",
  '&#039;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&eacute;': 'é',
  '&hellip;': '…'
};

export function decodeHtmlEntities(value) {
  return value.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity] ?? entity);
}

export function parseAnimeId(raw) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function cleanName(raw) {
  return decodeHtmlEntities(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseGenres(raw) {
  if (!raw) return [];
  const genres = raw
    .split(',')
    .map((genre) => genre.trim())
    .filter(Boolean);
  return [...new Set(genres)].sort((a, b) => a.localeCompare(b));
}

const TYPE_ENUM = ['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'];

export function parseType(raw) {
  const value = (raw ?? '').trim();
  return TYPE_ENUM.includes(value) ? value : 'Unknown';
}

export function parseEpisodes(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function parseRating(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  if (rounded < 0 || rounded > 10) return null;
  return rounded;
}

export function parseMembers(raw) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}
