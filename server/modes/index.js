/**
 * Registre des modes de jeu.
 *
 * Un mode est un objet qui respecte ce contrat :
 *   id, name          identifiants
 *   settingsSchema    réglages proposés au host dans le lobby
 *   minPlayers        (optionnel) minimum pour lancer
 *   start(room)                                 lance la partie
 *   handleAction(room, playerId, type, payload) -> message d'erreur ou undefined
 *   onPlayerLeave(room, playerId, player)       un joueur est parti (doit re-diffuser l'état)
 *   onPlayerDisconnect(room, playerId)          (optionnel) connexion perdue, place gardée
 *   getView(room, playerId)                     état visible par ce joueur ; playerId est
 *                                               null pour un écran partagé (vue publique)
 *
 * Pour ajouter un mode (ex. "double ou rien") : créer server/modes/<id>/index.js
 * et l'enregistrer ci-dessous. Room et socket.js n'ont pas à changer.
 */
const classic = require('./classic');

const MODES = {
  [classic.id]: classic,
};

function getMode(id) {
  const mode = MODES[id];
  if (!mode) throw new Error(`Mode de jeu inconnu : ${id}`);
  return mode;
}

module.exports = { getMode, MODES };
