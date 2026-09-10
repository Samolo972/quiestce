/**
 * Événements Socket.io communs à tous les modes : créer / rejoindre / quitter
 * une room, régler, lancer, revenir au lobby. Les actions de jeu passent toutes
 * par un unique événement générique "game:action", routé vers le mode.
 *
 * Chaque événement renvoie sa réponse via l'accusé de réception (callback) :
 * { ok: true, ... } ou { error: 'message lisible' }.
 */
const { randomUUID } = require('crypto');
const config = require('./config');
const { createRoom, getRoom, deleteRoom } = require('./rooms/roomManager');

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

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    /**
     * Enregistre un gestionnaire : attrape les erreurs (un bug ne doit pas
     * faire tomber le serveur) et renvoie toujours une réponse au client.
     */
    const on = (event, handler) => {
      socket.on(event, (...args) => {
        const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
        const data = args[0] && typeof args[0] === 'object' ? args[0] : {};
        try {
          ack(handler(data) || { ok: true });
        } catch (err) {
          console.error(`[socket] erreur sur "${event}"`, err);
          ack({ error: 'Erreur interne du serveur.' });
        }
      });
    };

    /** Room du joueur de cette connexion (ou null). */
    const currentRoom = () => {
      const room = getRoom(socket.data.roomCode);
      return room && room.getPlayer(socket.data.playerId) ? room : null;
    };
    const playerId = () => socket.data.playerId;

    function joinRoom(room, name) {
      // L'identifiant joueur est distinct du socket.id : il pourra servir de
      // jeton de reconnexion plus tard sans rien changer à la logique de jeu.
      const player = { id: randomUUID(), name, socketId: socket.id, score: 0 };
      room.addPlayer(player);
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      room.broadcast();
      return { ok: true, code: room.code, playerId: player.id };
    }

    function leaveCurrentRoom() {
      const room = currentRoom();
      if (!room) return;
      const id = playerId();
      const wasHost = room.isHost(id);

      socket.leave(room.code);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      const player = room.removePlayer(id);

      if (room.players.size === 0) return deleteRoom(room.code);

      let message = `${player.name} a quitté la partie.`;
      if (wasHost) message += ` ${room.getPlayer(room.hostId).name} devient le host.`;
      room.toast(message);

      if (room.phase === 'game') room.mode.onPlayerLeave(room, id, player);
      else room.broadcast();
    }

    // ------------------------------------------------------------ Événements

    on('room:create', ({ name }) => {
      if (currentRoom()) return { error: 'Tu es déjà dans une partie.' };
      const checked = cleanName(name);
      if (checked.error) return checked;
      return joinRoom(createRoom(io), checked.name);
    });

    on('room:join', ({ code, name }) => {
      if (currentRoom()) return { error: 'Tu es déjà dans une partie.' };
      const room = getRoom(code);
      if (!room) return { error: 'Aucune partie avec ce code.' };
      if (room.phase !== 'lobby') return { error: 'La partie a déjà commencé.' };
      if (room.players.size >= config.MAX_PLAYERS) return { error: 'La partie est complète.' };
      const checked = cleanName(name);
      if (checked.error) return checked;
      if (room.isNameTaken(checked.name)) return { error: 'Ce pseudo est déjà pris dans cette partie.' };
      return joinRoom(room, checked.name);
    });

    on('room:leave', () => {
      leaveCurrentRoom();
    });

    on('room:updateSettings', ({ patch }) => {
      const room = currentRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut modifier les réglages.' };
      if (room.phase !== 'lobby') return { error: 'La partie a déjà commencé.' };
      room.updateSettings(patch);
      room.broadcast();
    });

    on('room:start', () => {
      const room = currentRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut lancer la partie.' };
      if (room.phase !== 'lobby') return { error: 'La partie a déjà commencé.' };
      if (room.players.size < room.minPlayers) {
        return { error: `Il faut au moins ${room.minPlayers} joueurs.` };
      }
      room.start();
    });

    on('room:backToLobby', () => {
      const room = currentRoom();
      if (!room) return { error: "Tu n'es dans aucune partie." };
      if (!room.isHost(playerId())) return { error: 'Seul le host peut relancer.' };
      if (room.phase !== 'game' || room.game?.phase !== 'end') {
        return { error: "La partie n'est pas terminée." };
      }
      room.backToLobby();
      room.broadcast();
    });

    on('game:action', ({ type, payload }) => {
      const room = currentRoom();
      if (!room || room.phase !== 'game') return { error: 'Aucune partie en cours.' };
      const error = room.mode.handleAction(room, playerId(), String(type), payload);
      return error ? { error } : { ok: true };
    });

    // MVP : une déconnexion = départ définitif (voir README, "Reconnexion")
    socket.on('disconnect', () => {
      try {
        leaveCurrentRoom();
      } catch (err) {
        console.error('[socket] erreur à la déconnexion', err);
      }
    });
  });
}

module.exports = registerSocketHandlers;
