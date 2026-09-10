/**
 * Fin de partie : podium et classement final.
 */
import { request, leaveRoom } from '../net.js';
import { esc, checkResponse, rankPlayers } from '../ui.js';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default {
  key: () => 'end',

  mount(el) {
    el.innerHTML = `
      <section class="center"><h1>🏆 Classement final</h1></section>
      <div class="podium" id="podium"></div>
      <section class="card"><ol class="ranking" id="ranking"></ol></section>
      <div id="end-actions" class="stack"></div>`;

    el.querySelector('#end-actions').addEventListener('click', async (e) => {
      if (e.target.id === 'replay') checkResponse(await request('room:backToLobby'));
      if (e.target.id === 'quit') leaveRoom();
    });
  },

  update(el, s) {
    const ranked = rankPlayers(s.players);

    // Podium dans l'ordre visuel classique : 2e, 1er, 3e
    const [first, second, third] = ranked;
    el.querySelector('#podium').innerHTML = [second, first, third]
      .map((p, i) => p && `
        <div class="podium-step step-${[2, 1, 3][i]} ${p.id === s.you ? 'me' : ''}">
          <div class="podium-name">${MEDALS[p.rank] ?? ''} ${esc(p.name)}</div>
          <div class="podium-block"><b>${p.score}</b><small>pts</small></div>
        </div>`)
      .filter(Boolean).join('');

    el.querySelector('#ranking').innerHTML = ranked.map((p) => `
      <li class="${p.id === s.you ? 'me' : ''}">
        <span class="rank">${p.rank}</span><span class="name">${esc(p.name)}</span><b>${p.score} pts</b>
      </li>`).join('');

    el.querySelector('#end-actions').innerHTML = `
      ${s.hostId === s.you
        ? '<button type="button" class="btn primary block" id="replay">🔁 Rejouer avec les mêmes joueurs</button>'
        : '<p class="muted center">Le host peut relancer une partie.</p>'}
      <button type="button" class="btn ghost block" id="quit">Quitter</button>`;
  },
};
