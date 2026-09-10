/**
 * Barème dégressif : plus on vote tôt (avec peu d'indices), plus un bon vote rapporte.
 * Chaque palier signifie "si au plus `maxVisible` indices étaient visibles -> `points`".
 * Modifier ce tableau suffit pour changer le barème.
 */
const EARLY_VOTE_TIERS = [
  { maxVisible: 1, points: 3 }, // voté avant le 2e indice
  { maxVisible: 3, points: 2 }, // voté avant le 4e indice
];
const BASE_POINTS = 1;

function pointsForCorrectGuess(visibleCount, totalCount) {
  // Si le texte était déjà complet, aucune prise de risque : point de base
  if (visibleCount >= totalCount) return BASE_POINTS;
  const tier = EARLY_VOTE_TIERS.find((t) => visibleCount <= t.maxVisible);
  return tier ? tier.points : BASE_POINTS;
}

module.exports = { pointsForCorrectGuess };
