/**
 * Indices progressifs : l'anecdote est découpée en fragments révélés un par un.
 */

/**
 * Nombre de fragments pour que le texte soit entièrement révélé avant la fin
 * du vote. Le 1er fragment est visible dès le début, puis un nouveau arrive à
 * chaque intervalle. Ex. : vote 45 s, intervalle 8 s -> indices à 0, 8, 16, 24,
 * 32 et 40 s -> 6 fragments.
 */
function fragmentCount(voteTime, hintInterval, maxFragments) {
  const count = 1 + Math.floor((voteTime - 1) / hintInterval);
  return Math.max(1, Math.min(maxFragments, count));
}

/**
 * Découpe le texte en `count` morceaux de mots consécutifs, de tailles
 * équilibrées. Un texte court (moins de mots que `count`) donne moins de fragments.
 */
function splitIntoFragments(text, count) {
  const words = text.trim().split(/\s+/);
  const n = Math.max(1, Math.min(count, words.length));
  const fragments = [];
  for (let i = 0; i < n; i++) {
    const start = Math.round((i * words.length) / n);
    const end = Math.round(((i + 1) * words.length) / n);
    fragments.push(words.slice(start, end).join(' '));
  }
  return fragments;
}

module.exports = { fragmentCount, splitIntoFragments };
