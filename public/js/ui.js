/**
 * Petits utilitaires d'interface partagés par les écrans.
 */
import { serverNow, action } from './net.js';
import { play } from './sound.js';

/** Échappe le texte saisi par les joueurs avant de l'insérer en HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function plural(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/** Score abrégé : "0 pt", "1 pt", "3 pts". */
export function pts(n) {
  return plural(n, 'pt');
}

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('hide'), 3500);
  setTimeout(() => el.remove(), 4000);
}

/** Affiche l'erreur éventuelle d'une réponse serveur. Renvoie true si tout va bien. */
export function checkResponse(response) {
  if (response?.error) {
    toast(response.error, 'error');
    return false;
  }
  return true;
}

// ------------------------------------------------------- Jetons des joueurs
// Chaque joueur a une place fixe (slot, attribuée par le serveur) qui donne
// sa couleur et sa forme : triangle, losange, rond, carré.

const COLORS = 8;
const SHAPES = 4;

/** Classes CSS de couleur (cN) et de forme (sN) d'un joueur. */
export function tokenClass(player) {
  const slot = player?.slot;
  if (slot == null) return 'ghost';
  return `c${slot % COLORS} s${(slot + Math.floor(slot / COLORS)) % SHAPES}`;
}

export function tokenHtml(player) {
  return `<span class="token ${tokenClass(player)}" aria-hidden="true"><i></i></span>`;
}

/** Jeton "?" de l'auteur inconnu. */
export function mysteryToken() {
  return '<span class="token mystery" aria-hidden="true"><i>?</i></span>';
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

// ------------------------------------------------------- Comptes à rebours
// Tout élément portant data-deadline="<timestamp serveur>" affiche le temps
// restant. Un seul intervalle global met tout à jour. La classe "num"
// affiche le nombre seul (dans les disques de timer).

export function timerHtml(deadline, className = 'timer') {
  return `<span class="${className}" data-deadline="${deadline ?? ''}"></span>`;
}

export function secondsLeft(deadline) {
  return Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
}

export function tick() {
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    const deadline = Number(el.dataset.deadline);
    if (!deadline) {
      el.textContent = '';
      el.classList.remove('urgent');
      return;
    }
    const secs = secondsLeft(deadline);
    el.textContent = el.classList.contains('num') ? String(secs) : `${secs}s`;
    el.classList.toggle('urgent', secs <= 5);
    // Tic-tac sur les 5 dernières secondes, une fois par seconde (disque du timer)
    if (el.classList.contains('num') && secs > 0 && secs <= 5 && el.dataset.last !== String(secs)) play('tick');
    el.dataset.last = String(secs);
  });
}

export function startTicker() {
  setInterval(tick, 250);
}

// ------------------------------------------------------------ Blocs communs

/** En-tête de phase : disque du timer, titre, disque compteur (optionnel). */
export function phaseHeader(deadline, title, { counter = false } = {}) {
  return `
    <div class="phase-header">
      <div class="disc" title="Temps restant">${timerHtml(deadline, 'timer num')}</div>
      <h2 class="phase-title">${title}</h2>
      <div class="disc counter" ${counter ? '' : 'hidden'}><b id="counter-value"></b><small id="counter-label"></small></div>
    </div>`;
}

export function setCounter(el, value, label) {
  el.querySelector('#counter-value').textContent = value;
  el.querySelector('#counter-label').textContent = label;
}

/** Bulle de dialogue contenant une anecdote. */
export function bubbleHtml(text, size = '') {
  return `<figure class="bubble ${size}"><blockquote>${esc(text)}</blockquote></figure>`;
}

/** Barre de réactions emoji (joueurs uniquement ; le clic est géré dans main.js). */
export function reactionBar(state) {
  if (!state.you) return '';
  return `
    <div class="reaction-bar" role="group" aria-label="Réagir">
      ${(state.game?.reactions ?? []).map((emoji) => `<button type="button" class="react" data-react="${emoji}">${emoji}</button>`).join('')}
    </div>`;
}

// ----------------------------------------------------------------- Scores

/** Joueurs triés par score, avec leur rang (les ex æquo partagent le rang). */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
    return { ...p, rank };
  });
}

// ---------------------------------------------------------- Bouton "Suite"

/**
 * Zone de bas d'écran pour les transitions : le host peut passer, les
 * autres voient le compte à rebours avant la suite automatique. Sans
 * compte à rebours (étape sans durée), les autres lisent `idleText`.
 */
export function renderContinue(container, state, label = 'Continuer', waitLabel = 'Suite dans', idleText = 'Le host passera à la suite.') {
  const isHost = Boolean(state.you) && state.hostId === state.you;
  const key = `${isHost}|${state.game.deadline}|${state.game.paused}|${label}`;
  if (container.dataset.key === key) return; // évite de recréer le bouton à chaque mise à jour
  container.dataset.key = key;

  let countdown = `${esc(waitLabel)} ${timerHtml(state.game.deadline, 'timer inline')}`;
  if (state.game.paused) countdown = 'Partie en pause';
  else if (!state.game.deadline) countdown = isHost ? '' : esc(idleText);

  if (isHost) {
    container.innerHTML = `
      <button type="button" class="btn btn-go block">${esc(label)}</button>
      ${countdown ? `<p class="continue-note">${countdown}</p>` : ''}`;
    container.querySelector('button').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      checkResponse(await action('continue'));
    });
  } else {
    container.innerHTML = `<p class="continue-note">${countdown}</p>`;
  }
}
