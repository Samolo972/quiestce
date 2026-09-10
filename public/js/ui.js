/**
 * Petits utilitaires d'interface partagés par les écrans.
 */
import { serverNow, action } from './net.js';

/** Échappe le texte saisi par les joueurs avant de l'insérer en HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function plural(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
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

// ------------------------------------------------------- Comptes à rebours
// Tout élément portant data-deadline="<timestamp serveur>" affiche le temps
// restant. Un seul intervalle global met tout à jour.

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
      return;
    }
    const secs = secondsLeft(deadline);
    el.textContent = `${secs}s`;
    el.classList.toggle('urgent', secs <= 5);
  });
}

export function startTicker() {
  setInterval(tick, 250);
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
 * autres voient le compte à rebours avant la suite automatique.
 */
export function renderContinue(container, state, label = 'Continuer ▶', waitLabel = 'Suite dans') {
  const isHost = state.hostId === state.you;
  const key = `${isHost}|${state.game.deadline}|${label}`;
  if (container.dataset.key === key) return; // évite de recréer le bouton à chaque mise à jour
  container.dataset.key = key;

  const countdown = `${esc(waitLabel)} ${timerHtml(state.game.deadline, 'timer inline')}`;
  if (isHost) {
    container.innerHTML = `
      <button type="button" class="btn primary block">${esc(label)}</button>
      <p class="muted small center">${countdown}</p>`;
    container.querySelector('button').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      checkResponse(await action('continue'));
    });
  } else {
    container.innerHTML = `<p class="muted center">${countdown}</p>`;
  }
}
