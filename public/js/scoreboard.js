/**
 * Tableau des scores permanent (sidebar ou panneau mobile).
 * Le host y trouve aussi de quoi retirer un joueur.
 */
import { esc, rankPlayers, tokenHtml } from './ui.js';

export function renderScoreboard(el, state) {
  el.hidden = !state;
  if (!state) return;

  const game = state.game;
  // Pendant l'écriture et la manche bonus, on coche ceux qui ont fini
  const done = new Set(game?.doneIds ?? []);
  const showDone = Boolean(game?.doneIds);
  const players = state.phase === 'lobby' ? state.players : rankPlayers(state.players);
  const canKick = Boolean(state.you) && state.hostId === state.you;

  el.innerHTML = `
    <h3>Scores</h3>
    <ol class="score-list">
      ${players.map((p) => {
        const offline = p.connected === false;
        return `
          <li class="${p.id === state.you ? 'me' : ''} ${offline ? 'offline' : ''}">
            ${tokenHtml(p)}
            <span class="name">
              ${esc(p.name)}${p.id === state.hostId ? ' <small>host</small>' : ''}
              ${offline ? '<small class="status">hors ligne</small>' : ''}
            </span>
            ${showDone ? `<span class="done ${done.has(p.id) ? 'yes' : ''}" title="${done.has(p.id) ? 'A fini' : 'En cours'}">${done.has(p.id) ? '✓' : '…'}</span>` : ''}
            <b class="score">${p.score}</b>
            ${canKick && p.id !== state.you
              ? `<button type="button" class="kick" data-kick="${p.id}" data-name="${esc(p.name)}" title="Retirer de la partie" aria-label="Retirer ${esc(p.name)}">✕</button>`
              : ''}
          </li>`;
      }).join('')}
    </ol>`;
}
