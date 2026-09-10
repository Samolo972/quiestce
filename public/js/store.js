/**
 * État client minimal : la dernière vue envoyée par le serveur (ou null
 * quand on n'est dans aucune room). Le serveur fait autorité, on ne fait
 * que l'afficher.
 */
const listeners = new Set();
let state = null;

export const store = {
  get state() {
    return state;
  },
  set(next) {
    state = next;
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    listeners.add(fn);
  },
};
