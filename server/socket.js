/**
 * Événements Socket.io communs à tous les modes : créer / rejoindre / reprendre
 * / quitter une room, écran partagé, réglages, lancement, exclusion. Les
 * actions de jeu passent toutes par un unique événement générique
 * "game:action", routé vers le mode.
 *
 * Chaque événement renvoie sa réponse via l'accusé de réception (callback) :
 * { ok: true, ... } ou { error: 'message lisible' }.
 */
const { randomUUID, randomBytes } = require('crypto');
const config = require('./config');
const { createRoom, getRoom, deleteRoom, roomCount } = require('./rooms/roomManager');

function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '') // caractères de contrôle
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return { error: 'Choisis un pseudo.' };
  if (name.length > config.NAME_MAX_LENGTH) {
    return { error: `Pseudo trop long (${config.NAME_MAX_LENGTH} caractères max).` };
  }
  return { name };
}

// ------------------------------------------------------------------ Anti-abus

/** IP du client. Derrière nginx (connexion locale), on lit l'en-tête qu'il ajoute. */
function clientIp(socket) {
  const address = socket.handshake.address || '';
  const fromProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  const forwarded = socket.handshake.headers['x-real-ip'];
  return fromProxy && forwarded ? String(forwarded) : address;
}

const roomCreations = new Map(); // ip -> horodatages des créations récentes

function allowRoomCreation(ip) {
  const now = Date.now();
  const recent = (roomCreations.get(ip) ?? []).filter((t) => now - t < config.ROOMS_PER_IP_WINDOW_MS);
  const allowed = recent.length < config.ROOMS_PER_IP;
  if (allowed) recent.push(now);
  roomCreations.set(ip, recent);
  return allowed;
}

// Ménage régulier pour que la table des IP ne grossisse pas indéfiniment
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of roomCreations) {
    if (times.every((t) => now - t >= config.ROOMS_PER_IP_WINDOW_MS)) roomCreations.delete(ip);
  }
}, config.ROOMS_PER_IP_WINDOW_MS).unref();

// -------------------------------------------------------------------- Départs

/**
 * Retire définitivement un joueur : départ volontaire, exclusion par le host
 * ou fin du délai de reconnexion. La partie continue sans lui.
 */
function removePlayer(room, playerId, reason) {
  const wasHost = room.isHost(playerId);
  const player = room.removePlayer(playerId);
  if (!player) return;

  if (room.players.size === 0) {
    room.emitAll('room:closed', 'La partie est terminée : tous les joueurs sont partis.');
    deleteRoom(room.code);
    return;
  }

  const what = {
    left: 'a quitté la partie',
    kicked: 'a été retiré de la partie par le host',
    timeout: "ne s'est pas reconnecté et quitte la partie",
  }[reason];
  let message = `${player.name} ${what}.`;
  if (wasHost) message += ` ${room.getPlayer(room.hostId).name} devient le host.`;
  room.toast(message);

  if (room.phase === 'game') room.mode.onPlayerLeave(room, playerId, player);
  else room.broadcast();
}

// ------------------------------------------------------------------ Connexions

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Limite de débit : au-delà de N événements par fenêtre, on refuse poliment
    let windowStart = Date.now();
    let eventCount = 0;

    /**
     * Enregistre un gestionnaire : limite le débit, attrape les erreurs (un
     * bug ne doit pas faire tomber le serveur) et renvoie toujours une réponse.
     */
    const on = (event, handler) => {
      socket.on(event, (...args) => {
        const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
        const now = Date.now();
        if (now - windowStart > config.EVENTS_WINDOW_MS) {
          windowStart = now;
          eventCount = 0;
        }
        if (++eventCount > config.EVENTS_PER_WINDOW) {
          return ack({ error: "Doucement ! Trop d'actions d'un coup, réessaie dans un instant." });
        }
        const data = args[0] && typeof args[0] === 'object' ? args[0] : {};
        try {
          currentRoom()?.touch();
          ack(handler(data) || { ok: true });
        } catch (err) {
          console.error(`[socket] erreur sur "${event}"`, err);
          ack({ error: 'Erreur interne du serveur.' });
        }
      });
    };

    /** Room de cette connexion (joueur ou écran partagé), ou null. */
    const currentRoom = () => {
      const room = getRoom(socket.data.roomCode);
      if (!room) return null;
      if (socket.data.spectator) return room.spectators.has(socket.id) ? room : null;
      // Après une reprise sur une autre connexion, celle-ci n'a plus la main
      return room.getPlayer(socket.data.playerId)?.socketId === socket.id ? room : null;
    };
    /** Room seulement si cette connexion est un joueur (pas un écran partagé). */
    const playerRoom = () => (socket.data.spectator ? null : currentRoom());
    const playerId = () => socket.data.playerId;

    function attach(room, { id = null, spectator = false } = {}) {
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = id;
      socket.data.spectator = spectator;
    }

    function detach() {
      if (socket.data.roomCode) socket.leave(socket.data.roomCode);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      socket.data.spectator = false;
    }

    function joinRoom(room, name) {
      const player = {
        id: randomUUID(), // public : sert à désigner le joueur
        token: randomBytes(24).toString('base64url'), // secret : sert à la reconnexion
        name,
        socketId: socket.id,
        score: 0,
      };
      room.addPlayer(player);
      attach(room, { id: player.id });
      if (room.phase === 'game') room.toast(`${name} rejoint la partie en cours.`);
      room.broadcast();
      return { ok: true, code: room.code, playerId: player.id, token: player.token };
    }

    // ------------------------------------------------------------ Événements

    on('room:create', ({ name }) => {
      if (currentRoom()) return { error: 'Tu es déjà dans une partie.' };
      const checked = cleanName(name);
      if (checked.error) return checked;
      if (roomCount() >= config.MAX_ROOMS) return { error: 'Le serveur est plein pour le moment, réessaie plus tard.' };
      if (!allowRoomCreation(clientIp(socket))) {
        return { error: 'Trop de parties créées depuis ta connexion. Réessaie dans quelques minutes.' };
      }
      return joinRoom(createRoom(io), checked.name);
    });

    // On peut rejoindre à tout moment, y compris une partie en cours
    on('room:join', ({ code, name }) => {
      if (currentRoom()) return { error: 'Tu es déjà dans une partie.' };
      const room = getRoom(code);
      if (!room) return { error: 'Aucune partie avec ce code.' };
      if (room.players.size >= config.MAX_PLAYERS) return { error: 'La partie est complète.' };
      const checked = cleanName(name);
      if (checked.error) return checked;
      if (room.isNameTaken(checked.name)) return { error: 'Ce pseudo est déjà pris dans cette partie.' };
      return joinRoom(room, checked.name);
    });

    // Reconnexion : le client renvoie le jeton reçu à l'arrivée
    on('room:resume', ({ code, token }) => {
      if (currentRoom()) return { error: 'Tu es déjà dans une partie.' };
      const room = getRoom(code);
      const player = room && typeof token === 'string' ? room.findByToken(token) : null;
      if (!player) return { error: "Cette partie n'existe plus, ou tu en as été retiré." };

      // Une ancienne connexion encore ouverte (autre onglet) perd la main
      const previous = player.socketId && player.socketId !== socket.id && io.sockets.sockets.get(player.socketId);
      if (previous) {
        previous.leave(room.code);
        previous.data.roomCode = null;
        previous.data.playerId = null;
        previous.emit('room:closed', 'La partie a été reprise sur un autre onglet.');
      }

      const wasConnected = player.connected;
      room.markReconnected(player.id, socket.id);
      attach(room, { id: player.id });
      if (!wasConnected) room.toast(`${player.name} est de retour.`);
      room.broadcast();
      return { ok: true, code: room.code, playerId: player.id, token: player.token };
    });

    // Écran partagé : suit la partie sans jouer (jamais d'infos secrètes)
    on('room:watch', ({ code }) => {
      if (currentRoom()) return { error: 'Cette connexion est déjà dans une partie.' };
      const room = getRoom(code);
      if (!room) return { error: 'Aucune partie avec ce code.' };
      if (room.spectators.size >= config.MAX_SPECTATORS) return { error: "Trop d'écrans partagés sur cette partie." };
      room.spectators.add(socket.id);
      attach(room, { spectator: true });
      socket.emit('room:state', room.viewFor(null));
      return { ok: true, code: room.code };
    });

    on('room:leave', () => {
      const room = currentRoom();
      if (!room) return;
      if (socket.data.spectator) {
        room.spectators.delete(socket.id);
        detach();
        return;
      }
      const id = playerId();
      detach();
      removePlayer(room, id, 'left');
    });

    on('room:kick', ({ playerId: targetId }) => {
      const room = playerRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut retirer un joueur.' };
      const target = room.getPlayer(targetId);
      if (!target || target.id === playerId()) return { error: 'Joueur introuvable.' };

      const targetSocket = target.socketId && io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.leave(room.code);
        targetSocket.data.roomCode = null;
        targetSocket.data.playerId = null;
        targetSocket.emit('room:kicked', "Le host t'a retiré de la partie.");
      }
      removePlayer(room, target.id, 'kicked');
    });

    on('room:updateSettings', ({ patch }) => {
      const room = playerRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut modifier les réglages.' };
      if (room.phase !== 'lobby') return { error: 'La partie a déjà commencé.' };
      room.updateSettings(patch);
      room.broadcast();
    });

    on('room:start', () => {
      const room = playerRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut lancer la partie.' };
      if (room.phase !== 'lobby') return { error: 'La partie a déjà commencé.' };
      if (room.players.size < room.minPlayers) {
        return { error: `Il faut au moins ${room.minPlayers} joueurs.` };
      }
      room.start();
    });

    on('room:backToLobby', () => {
      const room = playerRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut relancer.' };
      if (room.phase !== 'game' || room.game?.phase !== 'end') {
        return { error: "La partie n'est pas terminée." };
      }
      room.backToLobby();
      room.broadcast();
    });

    on('game:action', ({ type, payload }) => {
      const room = playerRoom();
      if (!room || room.phase !== 'game') return { error: 'Aucune partie en cours.' };
      const error = room.mode.handleAction(room, playerId(), String(type), payload);
      return error ? { error } : { ok: true };
    });

    socket.on('disconnect', () => {
      try {
        const room = currentRoom();
        if (!room) return;
        if (socket.data.spectator) {
          room.spectators.delete(socket.id);
          return;
        }
        // Le joueur garde sa place un moment : il peut revenir avec son jeton
        const id = playerId();
        room.markDisconnected(id, () => removePlayer(room, id, 'timeout'));
        if (room.phase === 'game') room.mode.onPlayerDisconnect?.(room, id);
        else room.broadcast();
      } catch (err) {
        console.error('[socket] erreur à la déconnexion', err);
      }
    });
  });
}

module.exports = registerSocketHandlers;
