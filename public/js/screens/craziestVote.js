/**
 * Manche bonus : vote populaire pour l'anecdote la plus folle de la partie.
 */
import { action } from '../net.js';
import { esc, checkResponse, plural, phaseHeader, setCounter, tokenHtml, playerById } from '../ui.js';
import { play } from '../sound.js';

export default {
  key: () => 'craziest',

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      ${phaseHeader(g.deadline, "L'anecdote la plus folle", { counter: true })}
      <p class="soft center">
        ${s.you ? "Vote pour celle qui t'a le plus marqué." : 'Votez sur vos téléphones pour celle qui vous a le plus marqués.'}
        Son auteur gagne ${plural(g.bonus, 'point')}.
      </p>
      <div class="options" id="list"></div>`;
    play('go');

    el.querySelector('#list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn || btn.disabled) return;
      const list = el.querySelector('#list');
      list.querySelectorAll('[data-id]').forEach((b) => { b.disabled = true; });
      list.classList.add('locked');
      btn.classList.add('selected');
      const ok = checkResponse(await action('craziestVote', { anecdoteId: btn.dataset.id }));
      if (!ok) {
        list.classList.remove('locked');
        btn.classList.remove('selected');
        list.querySelectorAll('[data-id]:not(.mine)').forEach((b) => { b.disabled = false; });
      }
    });
  },

  update(el, s) {
    const g = s.game;
    const spectator = !s.you;
    const list = el.querySelector('#list');
    list.classList.toggle('locked', Boolean(g.myVote));
    list.innerHTML = g.candidates.map((a) => `
      <button type="button" class="option ${a.mine ? 'mine' : ''} ${g.myVote === a.id ? 'selected' : ''}"
              data-id="${a.id}" ${a.mine || g.myVote || spectator ? 'disabled' : ''}>
        <blockquote>${esc(a.text)}</blockquote>
        <span class="by">${tokenHtml(playerById(s, a.authorId))}${esc(a.authorName)}${a.mine ? ' (la tienne)' : ''}</span>
      </button>`).join('');
    setCounter(el, `${g.doneIds.length}/${g.expected}`, 'votes');
  },
};
