const Room = require('./Room');
const config = require('../config');
const { randomCode } = require('../utils/random');
const { getMode } = require('../modes');

/**
 * Registre des rooms en mémoire.
 * Pour passer un jour en multi-instance, c'est ce module (et Room) qu'il
 * faudrait adosser à Redis ; le reste du code n'y touche pas directement.
 */
const rooms = new Map(); // code -> Room

function createRoom(io, modeId = 'classic') {
  let code;
  do {
    code = randomCode(config.ROOM_CODE_LENGTH);
  } while (rooms.has(code));

  const room = new Room({ code, io, mode: getMode(modeId) });
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(String(code || '').trim().toUpperCase());
}

function deleteRoom(code) {
  rooms.get(code)?.destroy();
  rooms.delete(code);
}

function roomCount() {
  return rooms.size;
}

module.exports = { createRoom, getRoom, deleteRoom, roomCount };
