const config = require('../config');
const { defaultSettings, sanitizeSettings } = require('../utils/settings');

/**
 * Une room = une partie (en lobby ou en cours). Tout l'état vit en mémoire ici.
 *
 * La Room gère ce qui est commun à tous les modes : joueurs, host, réglages,
 * timers et diffusion de l'état. La logique de jeu est déléguée au "mode"
 * (voir server/modes), qui stocke son état dans `room.game`.
 */
class Room {
  constructor({ code, io, mode }) {
    this.code = code;
    this.io = io;
    this.mode = mode;
    this.players = new Map(); // playerId -> { id, name, socketId, score }
    this.hostId = null;
    this.settings = defaultSettings(mode.settingsSchema);
    this.phase = 'lobby'; // 'lobby' | 'game'
    this.game = null; // état propre au mode, créé au lancement
    this.timers = new Map(); // nom -> handle setTimeout
  }

  // ---------------------------------------------------------------- Joueurs

  addPlayer(player) {
    // "slot" = la plus petite place libre : il fixe la forme et la couleur du
    // joueur côté client, et ne bouge pas si quelqu'un d'autre part.
    const used = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    player.slot = slot;
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
  }

  /** Retire un joueur et transmet le rôle de host si besoin. */
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    this.players.delete(playerId);
    if (this.hostId === playerId) {
      this.hostId = this.players.keys().next().value ?? null;
    }
    return player;
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  isHost(playerId) {
    return this.hostId === playerId;
  }

  isNameTaken(name) {
    const lower = name.toLowerCase();
    return [...this.players.values()].some((p) => p.name.toLowerCase() === lower);
  }

  get minPlayers() {
    return this.mode.minPlayers ?? config.MIN_PLAYERS;
  }

  // --------------------------------------------------------------- Réglages

  updateSettings(patch) {
    this.settings = sanitizeSettings(this.settings, patch, this.mode.settingsSchema);
  }

  // ---------------------------------------------------------- Cycle de vie

  start() {
    this.phase = 'game';
    for (const p of this.players.values()) p.score = 0;
    this.mode.start(this);
  }

  backToLobby() {
    this.clearAllTimers();
    this.phase = 'lobby';
    this.game = null;
    for (const p of this.players.values()) p.score = 0;
  }

  destroy() {
    this.clearAllTimers();
  }

  // ----------------------------------------------------------------- Timers
  // Timers nommés : en relancer un du même nom annule le précédent.
  // Ils sont tous stoppés quand la room est détruite.

  setTimer(name, fn, ms) {
    this.clearTimer(name);
    const handle = setTimeout(() => {
      this.timers.delete(name);
      try {
        fn();
      } catch (err) {
        console.error(`[room ${this.code}] erreur dans le timer "${name}"`, err);
      }
    }, ms);
    this.timers.set(name, handle);
  }

  clearTimer(name) {
    clearTimeout(this.timers.get(name));
    this.timers.delete(name);
  }

  clearAllTimers() {
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
  }

  // -------------------------------------------------------------- Diffusion

  /** Envoie à chaque joueur SA vue de l'état (les infos secrètes sont filtrées). */
  broadcast() {
    for (const player of this.players.values()) {
      this.io.to(player.socketId).emit('room:state', this.viewFor(player.id));
    }
  }

  /** Petit message affiché chez tous les joueurs de la room. */
  toast(message) {
    this.io.to(this.code).emit('room:toast', message);
  }

  viewFor(playerId) {
    return {
      code: this.code,
      you: playerId,
      hostId: this.hostId,
      phase: this.phase,
      serverNow: Date.now(), // permet au client de caler ses comptes à rebours
      mode: { id: this.mode.id, name: this.mode.name },
      players: [...this.players.values()].map(({ id, name, score, slot }) => ({ id, name, score, slot })),
      minPlayers: this.minPlayers,
      maxPlayers: config.MAX_PLAYERS,
      settings: this.settings,
      settingsSchema: this.mode.settingsSchema,
      game: this.phase === 'game' ? this.mode.getView(this, playerId) : null,
    };
  }
}

module.exports = Room;
