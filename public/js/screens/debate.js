/**
 * Débat : l'anecdote s'affiche en entier, tout le monde discute pour deviner
 * qui l'a écrite. Le vote s'ouvre à la fin du timer (ou quand le host le décide).
 */
import { esc, renderContinue, timerHtml } from '../ui.js';

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      <div class="phase-header">
        <span class="badge">Anecdote ${g.index}/${g.count} · Manche ${g.round}/${g.totalRounds}</span>
        ${timerHtml(g.deadline)}
      </div>

      <section class="card anecdote-card">
        <p class="anecdote-text big">“${esc(g.text)}”</p>
      </section>

      <section class="card center">
        <div class="big-emoji">${g.isAuthor ? '🤫' : '🗣️'}</div>
        <h2>${g.isAuthor ? "C'est la tienne !" : 'Débattez !'}</h2>
        <p class="muted">${g.isAuthor
          ? 'Brouille les pistes pendant que les autres enquêtent…'
          : 'Qui a pu vivre ça ? Discutez, accusez, défendez-vous… Le vote arrive ensuite.'}</p>
      </section>

      <div id="continue"></div>`;
  },

  update(el, s) {
    renderContinue(el.querySelector('#continue'), s, 'Passer au vote ▶', 'Vote dans');
  },
};
