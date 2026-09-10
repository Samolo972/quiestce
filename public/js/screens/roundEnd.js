/**
 * Entre deux manches : classement intermédiaire.
 */
import { esc, renderContinue, rankPlayers, tokenHtml, pts } from '../ui.js';

const NEXT = {
  round: { text: 'Prochaine manche : préparez une nouvelle anecdote.', button: 'Manche suivante' },
  craziest: { text: "Place à la manche bonus : l'anecdote la plus folle.", button: 'Manche bonus' },
  end: { text: 'Il ne reste que le classement final.', button: 'Voir le classement final' },
};

export default {
  key: (s) => s.game.round,

  mount(el, s) {
    el.innerHTML = `
      <div class="center">
        <h1 class="screen-title">Fin de la manche ${s.game.round}</h1>
        <p class="soft" id="next-text"></p>
      </div>
      <ol class="ranking" id="ranking"></ol>
      <div id="continue"></div>`;
  },

  update(el, s) {
    const next = NEXT[s.game.nextStep] ?? NEXT.end;
    el.querySelector('#next-text').textContent = next.text;
    el.querySelector('#ranking').innerHTML = rankPlayers(s.players).map((p) => `
      <li class="${p.id === s.you ? 'me' : ''}">
        <span class="rank">${p.rank}</span>${tokenHtml(p)}
        <span class="name">${esc(p.name)}</span><b class="pts">${pts(p.score)}</b>
      </li>`).join('');
    renderContinue(el.querySelector('#continue'), s, next.button);
  },
};
