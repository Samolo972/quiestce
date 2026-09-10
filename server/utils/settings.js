/**
 * Outils génériques pour les réglages de room.
 * Un "schéma" décrit chaque réglage : type, bornes, valeur par défaut, libellé.
 * Le même schéma sert à valider côté serveur ET à générer le formulaire du lobby.
 */

function defaultSettings(schema) {
  return Object.fromEntries(Object.entries(schema).map(([key, def]) => [key, def.default]));
}

/**
 * Applique un patch envoyé par le client en le validant contre le schéma.
 * Les clés inconnues sont ignorées, les nombres sont bornés et arrondis au pas.
 */
function sanitizeSettings(current, patch, schema) {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    const def = schema[key];
    if (!def) continue;

    if (def.type === 'boolean') {
      next[key] = Boolean(value);
    } else if (def.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const stepped = Math.round((n - def.min) / def.step) * def.step + def.min;
      next[key] = Math.min(def.max, Math.max(def.min, stepped));
    }
  }
  return next;
}

module.exports = { defaultSettings, sanitizeSettings };
