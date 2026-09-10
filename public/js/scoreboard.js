/**
 * Tableau des scores permanent (sidebar ou panneau mobile).
 */
import { esc, rankPlayers } from './ui.js';

export function renderScoreboard(el, state) {
  el.hidden = !state;
  if (!state) return;

  const game = state.game;
  // Pendant l'écriture et la manche bonus, on coche ceux qui ont fini
  const done = new Set(game?.doneIds ?? []);
  const showDone = Boolean(game?.doneIds);
  const players = state.phase === 'lobby' ? state.players : rankPlayers(state.players);

  el.innerHTML = `
    <h3>🏆 Scores</h3>
    <ol class="score-list">
      ${players.map((p) => `
        <li class="${p.id === state.you ? 'me' : ''}">
          <span class="rank">${p.rank ?? '•'}</span>
          <span class="name">${esc(p.name)}${p.id === state.hostId ? ' 👑' : ''}</span>
          ${showDone ? `<span class="done">${done.has(p.id) ? '✅' : '⏳'}</span>` : ''}
          <b class="score">${p.score}</b>
        </li>`).join('')}
    </ol>`;
}
