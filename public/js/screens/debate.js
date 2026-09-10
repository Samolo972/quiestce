/**
 * Débat : l'anecdote s'affiche en entier, tout le monde discute pour deviner
 * qui l'a écrite. Le vote s'ouvre à la fin du timer (ou quand le host le décide).
 */
import { renderContinue, phaseHeader, bubbleHtml, tokenHtml, mysteryToken, playerById } from '../ui.js';

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      ${phaseHeader(g.deadline, `Anecdote ${g.index} sur ${g.count}`)}
      ${bubbleHtml(g.text, 'big')}
      <div class="speaker">
        ${g.isAuthor ? tokenHtml(playerById(s, s.you)) : mysteryToken()}
        <span>${g.isAuthor ? "C'est la tienne. Brouille les pistes&nbsp;!" : 'Débattez&nbsp;: qui a pu vivre ça&nbsp;?'}</span>
      </div>
      <div id="continue"></div>`;
  },

  update(el, s) {
    renderContinue(el.querySelector('#continue'), s, 'Passer au vote', 'Vote dans');
  },
};
