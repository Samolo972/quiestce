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
 *
 * state.you vaut null sur un écran partagé (télé, ordinateur) : il suit la
 * partie sans jouer.
 */
import { socket, syncClock, leaveRoom, request, action, session } from './net.js';
import { store } from './store.js';
import { toast, tick, startTicker, checkResponse } from './ui.js';
import { renderScoreboard } from './scoreboard.js';
import { unlockAudio, isMuted, setMuted } from './sound.js';

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
const EXTENDABLE = ['submit', 'debate', 'vote', 'craziestVote'];

const $ = (id) => document.getElementById(id);
const root = $('screen');
const scoreboardEl = $('scoreboard');
const hostBar = $('host-bar');
const connectionBanner = $('connection');
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

  // +30 s ou pause : l'échéance change, on resynchronise le disque du timer
  root.querySelectorAll('.phase-header [data-deadline]').forEach((el) => {
    el.dataset.deadline = state?.game?.deadline ?? '';
  });

  // Habillage commun
  const inRoom = Boolean(state);
  document.body.classList.toggle('in-room', inRoom);
  document.body.classList.toggle('paused', Boolean(state?.game?.paused));
  document.documentElement.classList.toggle('spectator', inRoom && !state.you);
  if (!inRoom) document.body.classList.remove('show-scores');
  $('topbar').hidden = !inRoom;
  if (inRoom) {
    $('topbar-code').textContent = state.code;
    $('topbar-round').textContent = roundLabel(state);
  }
  renderScoreboard(scoreboardEl, state);
  renderHostBar(state);
  keepAwake(inRoom);
  tick();
}

// ------------------------------------------------------------ Barre du host

function renderHostBar(state) {
  const g = state?.game;
  const show = Boolean(g && state.you && state.hostId === state.you && (g.deadline || g.paused));
  hostBar.hidden = !show;
  document.body.classList.toggle('has-host-bar', show);
  if (!show) return;

  const canExtend = EXTENDABLE.includes(g.phase);
  const key = `${canExtend}|${g.paused}`;
  if (hostBar.dataset.key === key) return;
  hostBar.dataset.key = key;
  hostBar.innerHTML = `
    ${canExtend ? `<button type="button" class="btn btn-flat" data-host="extend">+${g.extendSeconds} s</button>` : ''}
    <button type="button" class="btn btn-flat" data-host="pause">${g.paused ? 'Reprendre' : 'Pause'}</button>`;
}

hostBar.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-host]');
  if (btn) checkResponse(await action(btn.dataset.host));
});

// ------------------------------------------------- Écran toujours allumé
// Un téléphone qui se met en veille coupe sa connexion : on l'en empêche
// pendant la partie (Wake Lock, pris en charge par la plupart des navigateurs mobiles).

let wakeLock = null;

async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* refusé (mode économie d'énergie…) : pas grave */ }
}

// Le verrou saute quand on quitte l'onglet : on le reprend au retour
document.addEventListener('visibilitychange', () => keepAwake(Boolean(store.state)));

// ---------------------------------------------------------------- Réactions

function spawnReaction(emoji) {
  const layer = $('reactions');
  if (layer.childElementCount > 30) return;
  const el = document.createElement('span');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.style.left = `${8 + Math.random() * 84}%`;
  el.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 90)}px`);
  layer.append(el);
  setTimeout(() => el.remove(), 2600);
}

// ------------------------------------------------------------- Socket.io

/** Sortie de la partie décidée par le serveur (exclusion, partie fermée…). */
function exitRoom(message) {
  session.clear();
  connectionBanner.hidden = true;
  store.set(null);
  if (message) toast(message, 'error');
}

socket.on('room:state', (state) => {
  syncClock(state.serverNow);
  store.set(state);
});

socket.on('room:toast', (message) => toast(message));
socket.on('room:reaction', ({ emoji }) => spawnReaction(emoji));
socket.on('room:kicked', exitRoom);
socket.on('room:closed', exitRoom);

// À chaque connexion (première ou après une coupure), on reprend sa place si on en avait une
socket.on('connect', async () => {
  connectionBanner.hidden = true;
  const saved = session.get();
  if (!saved?.code) return;
  const res = saved.spectator
    ? await request('room:watch', { code: saved.code })
    : await request('room:resume', { code: saved.code, token: saved.token });
  if (res.error) exitRoom(res.error);
});

socket.on('disconnect', () => {
  if (store.state) connectionBanner.hidden = false;
});

// ------------------------------------------------------------ Démarrage

store.subscribe(render);

$('leave').addEventListener('click', () => {
  if (confirm('Quitter la partie ?')) leaveRoom();
});
$('toggle-scores').addEventListener('click', () => {
  document.body.classList.toggle('show-scores');
});

const muteBtn = $('mute');
function renderMute() {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', isMuted() ? 'Activer le son' : 'Couper le son');
}
muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  renderMute();
});
renderMute();

// Le son ne peut démarrer qu'après un geste de l'utilisateur
document.addEventListener('pointerdown', unlockAudio);

document.addEventListener('click', (e) => {
  // Réactions : les erreurs sont ignorées, c'est juste pour rire
  const reactBtn = e.target.closest('[data-react]');
  if (reactBtn) action('react', { emoji: reactBtn.dataset.react });
  // Sur mobile, toucher en dehors du panneau des scores le referme
  if (!e.target.closest('#scoreboard, #toggle-scores')) document.body.classList.remove('show-scores');
});

// Retrait d'un joueur par le host, depuis le tableau des scores
scoreboardEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-kick]');
  if (btn && confirm(`Retirer ${btn.dataset.name} de la partie ?`)) {
    checkResponse(await request('room:kick', { playerId: btn.dataset.kick }));
  }
});

startTicker();
render(null);
