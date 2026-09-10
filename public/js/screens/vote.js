/**
 * Vote après le débat : chaque joueur est une tuile (sa couleur, sa forme).
 * L'auteur est révélé quand tout le monde a voté (ou à la fin du timer).
 */
import { action } from '../net.js';
import {
  esc, checkResponse, plural, phaseHeader, setCounter, bubbleHtml,
  tokenHtml, tokenClass, mysteryToken, playerById,
} from '../ui.js';

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      ${phaseHeader(g.deadline, 'Qui a dit ça&nbsp;?', { counter: true })}
      ${bubbleHtml(g.text)}

      <div id="vote-zone">
        <div class="speaker">${mysteryToken()}<span id="vote-hint"></span></div>
        <div class="tiles" id="choices"></div>
      </div>

      <section class="wait-screen" id="author-zone" hidden>
        ${tokenHtml(playerById(s, s.you))}
        <h2>C'est ton anecdote</h2>
        <p class="soft">Les autres votent. Verdict dans un instant.</p>
      </section>`;

    el.querySelector('#choices').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-target]');
      if (!btn || btn.disabled) return;
      const choices = el.querySelector('#choices');
      choices.querySelectorAll('[data-target]').forEach((b) => { b.disabled = true; });
      choices.classList.add('locked');
      btn.classList.add('selected');
      const ok = checkResponse(await action('vote', { targetId: btn.dataset.target }));
      if (!ok) {
        choices.classList.remove('locked');
        btn.classList.remove('selected');
        choices.querySelectorAll('[data-target]').forEach((b) => { b.disabled = false; });
      }
    });
  },

  update(el, s) {
    const g = s.game;
    el.querySelector('#author-zone').hidden = !g.isAuthor;
    el.querySelector('#vote-zone').hidden = g.isAuthor;
    setCounter(el, `${g.votedCount}/${g.expected}`, 'votes');
    if (g.isAuthor) return;

    el.querySelector('#vote-hint').textContent = g.myVote
      ? 'Vote envoyé. Verdict quand tout le monde aura voté.'
      : `Un bon vote rapporte ${plural(g.points, 'point')}.`;

    // La liste est reconstruite (un joueur a pu partir) ; pas de champ de saisie ici
    const choices = el.querySelector('#choices');
    choices.classList.toggle('locked', Boolean(g.myVote));
    choices.innerHTML = s.players
      .filter((p) => p.id !== s.you)
      .map((p) => `
        <button type="button" class="tile ${tokenClass(p)} ${g.myVote === p.id ? 'selected' : ''}"
                data-target="${p.id}" ${g.myVote ? 'disabled' : ''}>
          ${tokenHtml(p)}<span>${esc(p.name)}</span>
        </button>`)
      .join('');
  },
};
