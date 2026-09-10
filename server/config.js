/**
 * Constantes globales du serveur.
 * Les réglages modifiables par le host sont définis par chaque mode de jeu
 * (voir server/modes/classic/settings.js).
 */
module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  // En production derrière nginx, mettre HOST=127.0.0.1 pour ne pas exposer le port
  HOST: process.env.HOST || undefined,

  // Minimum de joueurs pour lancer (à 2, deviner l'auteur serait trivial)
  MIN_PLAYERS: Number(process.env.MIN_PLAYERS) || 3,
  MAX_PLAYERS: 12,

  NAME_MAX_LENGTH: 16,
  ROOM_CODE_LENGTH: 4,
};
