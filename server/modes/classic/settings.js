/**
 * Réglages du mode "Qui a dit ça ?" proposés au host dans le lobby.
 * Le client génère le formulaire à partir de ce schéma : ajouter un réglage
 * ici suffit pour qu'il apparaisse (il reste à l'utiliser dans la logique).
 */
const SETTINGS_SCHEMA = {
  submitTime: {
    type: 'number', label: 'Temps pour écrire son anecdote', unit: 's',
    min: 30, max: 120, step: 5, default: 60,
  },
  voteTime: {
    type: 'number', label: 'Temps de vote par anecdote', unit: 's',
    min: 30, max: 90, step: 5, default: 45,
  },
  hintInterval: {
    type: 'number', label: 'Un nouvel indice toutes les', unit: 's',
    min: 5, max: 20, step: 1, default: 8,
  },
  rounds: {
    type: 'number', label: 'Nombre de manches', unit: '',
    help: '1 manche = 1 anecdote par joueur',
    min: 1, max: 5, step: 1, default: 2,
  },
  undetectableBonus: {
    type: 'boolean', label: 'Bonus « indétectable »',
    help: "+1 pt pour l'auteur si personne ne l'a démasqué",
    default: true,
  },
  craziestRound: {
    type: 'boolean', label: 'Manche bonus « anecdote la plus folle »',
    help: "Vote final pour la meilleure anecdote : +2 pts pour l'auteur",
    default: true,
  },
};

/** Règles fixes (non réglables dans le lobby). Durées en secondes. */
const RULES = {
  ANECDOTE_MIN_LENGTH: 10,
  ANECDOTE_MAX_LENGTH: 280,
  MAX_FRAGMENTS: 10,
  UNDETECTABLE_BONUS: 1,
  CRAZIEST_BONUS: 2,
  REVEAL_DURATION: 15,
  ROUND_END_DURATION: 20,
  CRAZIEST_REVEAL_DURATION: 25,
};

module.exports = { SETTINGS_SCHEMA, RULES };
