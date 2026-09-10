const config = require('../config');
const { defaultSettings, sanitizeSettings } = require('../utils/settings');

/**
 * Une room = une partie (en lobby ou en cours). Tout l'état vit en mémoire ici.
 *
 * La Room gère ce qui est commun à tous les modes : joueurs (et leur
 * reconnexion), écrans partagés, host, réglages, timers et diffusion de
 * l'état. La logique de jeu est déléguée au "mode" (voir server/modes), qui
 * stocke son état dans `room.game`.
 */
class Room {
  constructor({ code, io, mode }) {
    this.code = code;
    this.io = io;
    this.mode = mode;
    // playerId -> { id, token, name, socketId, score, slot, connected }
    // Le token est secret (il sert à la reconnexion) : il n'est jamais diffusé.
    this.players = new Map();
    this.spectators = new Set(); // socketIds des écrans partagés
    this.hostId = null;
    this.settings = defaultSettings(mode.settingsSchema);
    this.phase = 'lobby'; // 'lobby' | 'game'
    this.game = null; // état propre au mode, créé au lancement
    this.timers = new Map(); // timers du jeu : nom -> handle setTimeout
    this.graceTimers = new Map(); // joueurs déconnectés en sursis : playerId -> handle
    this.lastActivity = Date.now();
  }

  touch() {
    this.lastActivity = Date.now();
  }

  // ---------------------------------------------------------------- Joueurs

  addPlayer(player) {
    // "slot" = la plus petite place libre : il fixe la forme et la couleur du
    // joueur côté client, et ne bouge pas si quelqu'un d'autre part.
    const used = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    player.slot = slot;
    player.connected = true;
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
  }

  /** Retire un joueur et transmet le rôle de host si besoin. */
  removePlayer(playerId) {
    this.cancelGrace(playerId);
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

  findByToken(token) {
    if (!token) return undefined;
    return [...this.players.values()].find((p) => p.token === token);
  }

  /** Joueurs actuellement connectés (les autres sont en sursis de reconnexion). */
  connectedIds() {
    return [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
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

  // ------------------------------------------------------------- Reconnexion

  /** Le joueur garde sa place pendant le délai de reconnexion, puis onExpire est appelé. */
  markDisconnected(playerId, onExpire) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    this.cancelGrace(playerId);
    this.graceTimers.set(playerId, setTimeout(() => {
      this.graceTimers.delete(playerId);
      try {
        onExpire();
      } catch (err) {
        console.error(`[room ${this.code}] erreur à l'expiration de la reconnexion`, err);
      }
    }, config.RECONNECT_GRACE_MS));
  }

  markReconnected(playerId, socketId) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.cancelGrace(playerId);
    player.connected = true;
    player.socketId = socketId;
  }

  cancelGrace(playerId) {
    clearTimeout(this.graceTimers.get(playerId));
    this.graceTimers.delete(playerId);
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
    for (const handle of this.graceTimers.values()) clearTimeout(handle);
    this.graceTimers.clear();
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

  /** Envoie à chaque joueur SA vue de l'état, et aux écrans partagés la vue publique. */
  broadcast() {
    for (const player of this.players.values()) {
      if (player.socketId) this.io.to(player.socketId).emit('room:state', this.viewFor(player.id));
    }
    if (this.spectators.size) {
      const view = this.viewFor(null);
      for (const socketId of this.spectators) this.io.to(socketId).emit('room:state', view);
    }
  }

  /** Événement envoyé à tout le monde dans la room (joueurs et écrans partagés). */
  emitAll(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  /** Petit message affiché chez tous. */
  toast(message) {
    this.emitAll('room:toast', message);
  }

  /** Vue d'un joueur, ou d'un écran partagé si playerId est null. */
  viewFor(playerId) {
    return {
      code: this.code,
      you: playerId,
      hostId: this.hostId,
      phase: this.phase,
      serverNow: Date.now(), // permet au client de caler ses comptes à rebours
      mode: { id: this.mode.id, name: this.mode.name },
      // Champs listés un par un : le token ne doit jamais partir chez les autres
      players: [...this.players.values()].map(({ id, name, score, slot, connected }) => ({
        id, name, score, slot, connected,
      })),
      minPlayers: this.minPlayers,
      maxPlayers: config.MAX_PLAYERS,
      settings: this.settings,
      settingsSchema: this.mode.settingsSchema,
      game: this.phase === 'game' ? this.mode.getView(this, playerId) : null,
    };
  }
}

module.exports = Room;
