/**
 * Fin de partie : podium et classement final.
 */
import { request, leaveRoom } from '../net.js';
import { esc, checkResponse, rankPlayers, tokenHtml, tokenClass, pts } from '../ui.js';

export default {
  key: () => 'end',

  mount(el) {
    el.innerHTML = `
      <h1 class="screen-title">Classement final</h1>
      <div class="podium" id="podium"></div>
      <ol class="ranking" id="ranking"></ol>
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
    el.querySelector('#podium').innerHTML = [[second, 2], [first, 1], [third, 3]]
      .filter(([p]) => p)
      .map(([p, place]) => `
        <div class="podium-step step-${place} ${tokenClass(p)} ${p.id === s.you ? 'me' : ''}">
          ${tokenHtml(p)}
          <div class="podium-name">${esc(p.name)}</div>
          <div class="podium-score">${pts(p.score)}</div>
          <div class="podium-block">${p.rank}</div>
        </div>`)
      .join('');

    el.querySelector('#ranking').innerHTML = ranked.map((p) => `
      <li class="${p.id === s.you ? 'me' : ''}">
        <span class="rank">${p.rank}</span>${tokenHtml(p)}
        <span class="name">${esc(p.name)}</span><b class="pts">${pts(p.score)}</b>
      </li>`).join('');

    el.querySelector('#end-actions').innerHTML = `
      ${s.hostId === s.you
        ? '<button type="button" class="btn btn-go block" id="replay">Rejouer avec les mêmes joueurs</button>'
        : '<p class="continue-note">Le host peut relancer une partie.</p>'}
      <button type="button" class="btn btn-flat block" id="quit">Quitter</button>`;
  },
};
