/**
 * Point d'entrée du front : reçoit l'état du serveur et affiche le bon écran.
 *
 * Chaque écran (dossier screens/) est un objet :
 *   key(state)            identité de l'écran : s'il change, on reconstruit l'écran
 *   mount(el, state)      construit le HTML et branche les événements
 *   update(el, state)     met à jour ce qui bouge (compteurs, listes…)
 *   unmount()             (optionnel) nettoyage : timers, animations…
 * Séparer mount et update évite d'effacer un champ en cours de saisie à
 * chaque message du serveur.
 */
import { socket, syncClock, leaveRoom } from './net.js';
import { store } from './store.js';
import { toast, tick, startTicker } from './ui.js';
import { renderScoreboard } from './scoreboard.js';

import home from './screens/home.js';
import lobby from './screens/lobby.js';
import submit from './screens/submit.js';
import debate from './screens/debate.js';
import vote from './screens/vote.js';
import reveal from './screens/reveal.js';
import roundEnd from './screens/roundEnd.js';
import craziestVote from './screens/craziestVote.js';
import craziestReveal from './screens/craziestReveal.js';
import end from './screens/end.js';

// Nom de phase serveur -> écran
const SCREENS = { home, lobby, submit, debate, vote, reveal, roundEnd, craziestVote, craziestReveal, end };

const root = document.getElementById('screen');
const scoreboardEl = document.getElementById('scoreboard');
const topbar = document.getElementById('topbar');
let mounted = { key: null, screen: null };

/** Où en est la partie, affiché dans la barre du haut. */
function roundLabel(state) {
  const g = state.game;
  if (!g) return "Salle d'attente";
  if (g.phase === 'end') return 'Partie terminée';
  if (g.phase.startsWith('craziest')) return 'Manche bonus';
  return `Manche ${g.round} sur ${g.totalRounds}`;
}

function screenName(state) {
  if (!state) return 'home';
  if (state.phase === 'lobby') return 'lobby';
  return SCREENS[state.game?.phase] ? state.game.phase : 'home';
}

function render(state) {
  const name = screenName(state);
  const screen = SCREENS[name];
  const key = `${name}|${screen.key ? screen.key(state) : ''}`;

  if (key !== mounted.key) {
    mounted.screen?.unmount?.();
    root.innerHTML = '';
    root.className = `screen-${name}`;
    screen.mount(root, state);
    mounted = { key, screen };
    window.scrollTo(0, 0);
  }
  screen.update?.(root, state);

  // Habillage commun
  document.body.classList.toggle('in-room', Boolean(state));
  if (!state) document.body.classList.remove('show-scores');
  topbar.hidden = !state;
  if (state) {
    document.getElementById('topbar-code').textContent = state.code;
    document.getElementById('topbar-round').textContent = roundLabel(state);
  }
  renderScoreboard(scoreboardEl, state);
  tick();
}

// ------------------------------------------------------------- Socket.io

socket.on('room:state', (state) => {
  syncClock(state.serverNow);
  store.set(state);
});

socket.on('room:toast', (message) => toast(message));

socket.on('disconnect', () => {
  // MVP : le serveur retire le joueur à la déconnexion, on revient à l'accueil
  if (store.state) {
    toast('Connexion perdue : tu as été retiré de la partie.', 'error');
    store.set(null);
  }
});

// ------------------------------------------------------------ Démarrage

store.subscribe(render);

document.getElementById('leave').addEventListener('click', () => {
  if (confirm('Quitter la partie ?')) leaveRoom();
});
document.getElementById('toggle-scores').addEventListener('click', () => {
  document.body.classList.toggle('show-scores');
});
// Sur mobile, toucher en dehors du panneau des scores le referme
document.addEventListener('click', (e) => {
  if (!e.target.closest('#scoreboard, #toggle-scores')) document.body.classList.remove('show-scores');
});

startTicker();
render(null);
