/* global io */
/**
 * Communication avec le serveur.
 */
import { store } from './store.js';

export const socket = io();

// Décalage entre l'horloge du serveur et celle du téléphone, pour que
// les comptes à rebours soient justes même si l'heure du téléphone est fausse.
let clockOffset = 0;

export function syncClock(serverTime) {
  clockOffset = serverTime - Date.now();
}

export function serverNow() {
  return Date.now() + clockOffset;
}

/** Envoie un événement et attend la réponse du serveur ({ ok } ou { error }). */
export function request(event, data = {}) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, data, (err, response) => {
      resolve(err ? { error: 'Le serveur ne répond pas.' } : response);
    });
  });
}

/** Action de jeu, routée côté serveur vers le mode en cours. */
export function action(type, payload = {}) {
  return request('game:action', { type, payload });
}

export function leaveRoom() {
  request('room:leave');
  store.set(null);
}
