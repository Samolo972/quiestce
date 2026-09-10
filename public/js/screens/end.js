/**
 * Fin de partie : podium, récompenses et classement final.
 */
import { request, leaveRoom } from '../net.js';
import { esc, checkResponse, rankPlayers, tokenHtml, tokenClass, pts, playerById } from '../ui.js';
import { play } from '../sound.js';

// Statistiques envoyées par le serveur -> titre et description affichés
const s = (n) => (n > 1 ? 's' : '');
const AWARDS = {
  correct: { title: 'Meilleur détective', text: (n) => `${n} bon${s(n)} vote${s(n)}` },
  fooled: { title: 'Maître du mystère', text: (n) => `a trompé les autres ${n} fois` },
  wrongCast: { title: 'Le plus crédule', text: (n) => `${n} vote${s(n)} raté${s(n)}` },
};

export default {
  key: () => 'end',

  mount(el) {
    el.innerHTML = `
      <h1 class="screen-title">Classement final</h1>
      <div class="podium" id="podium"></div>
      <section class="awards" id="awards"></section>
      <ol class="ranking" id="ranking"></ol>
      <div id="end-actions" class="stack"></div>`;
    play('win');

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

    const awards = (s.game.awards ?? []).filter((a) => AWARDS[a.key]);
    const awardsEl = el.querySelector('#awards');
    awardsEl.hidden = awards.length === 0;
    awardsEl.innerHTML = awards.map((a) => {
      const winners = a.playerIds.map((id) => playerById(s, id)).filter(Boolean);
      return `
        <div class="award">
          <div class="award-tokens">${winners.map(tokenHtml).join('')}</div>
          <h3>${AWARDS[a.key].title}</h3>
          <p>${winners.map((p) => esc(p.name)).join(', ')}</p>
          <small>${AWARDS[a.key].text(a.value)}</small>
        </div>`;
    }).join('');

    el.querySelector('#ranking').innerHTML = ranked.map((p) => `
      <li class="${p.id === s.you ? 'me' : ''}">
        <span class="rank">${p.rank}</span>${tokenHtml(p)}
        <span class="name">${esc(p.name)}</span><b class="pts">${pts(p.score)}</b>
      </li>`).join('');

    let actions = '<p class="continue-note">Le host peut relancer une partie.</p>';
    if (!s.you) actions = '';
    else if (s.hostId === s.you) actions = '<button type="button" class="btn btn-go block" id="replay">Rejouer avec les mêmes joueurs</button>';
    el.querySelector('#end-actions').innerHTML = `
      ${actions}
      <button type="button" class="btn btn-flat block" id="quit">Quitter</button>`;
  },
};
