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
  MAX_SPECTATORS: 4, // écrans partagés (télé, ordinateur) par partie

  NAME_MAX_LENGTH: 16,
  ROOM_CODE_LENGTH: 4,

  // Reconnexion : un joueur déconnecté garde sa place (et ses points) pendant ce délai
  RECONNECT_GRACE_MS: 60_000,

  // Anti-abus
  MAX_ROOMS: 300, // parties simultanées sur le serveur
  ROOMS_PER_IP: 5, // créations de parties par adresse IP…
  ROOMS_PER_IP_WINDOW_MS: 10 * 60_000, // …sur 10 minutes
  EVENTS_PER_WINDOW: 30, // événements par connexion…
  EVENTS_WINDOW_MS: 5_000, // …sur 5 secondes
  ROOM_IDLE_MS: 3 * 60 * 60_000, // une partie sans activité depuis 3 h est supprimée
};
