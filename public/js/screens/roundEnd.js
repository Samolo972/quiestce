/**
 * Entre deux manches : classement intermédiaire.
 */
import { esc, renderContinue, rankPlayers } from '../ui.js';

const NEXT = {
  round: { text: 'Prochaine manche : préparez vos anecdotes !', button: 'Manche suivante ▶' },
  craziest: { text: "Place à la manche bonus : l'anecdote la plus folle 🤪", button: 'Manche bonus ▶' },
  end: { text: 'Plus que les résultats finaux…', button: 'Voir le classement ▶' },
};

export default {
  key: (s) => s.game.round,

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      <section class="card center">
        <h1>Fin de la manche ${g.round}/${g.totalRounds}</h1>
        <p class="muted" id="next-text"></p>
      </section>
      <section class="card">
        <ol class="ranking" id="ranking"></ol>
      </section>
      <div id="continue"></div>`;
  },

  update(el, s) {
    const next = NEXT[s.game.nextStep] ?? NEXT.end;
    el.querySelector('#next-text').textContent = next.text;
    el.querySelector('#ranking').innerHTML = rankPlayers(s.players).map((p) => `
      <li class="${p.id === s.you ? 'me' : ''}">
        <span class="rank">${p.rank}</span><span class="name">${esc(p.name)}</span><b>${p.score} pts</b>
      </li>`).join('');
    renderContinue(el.querySelector('#continue'), s, next.button);
  },
};
