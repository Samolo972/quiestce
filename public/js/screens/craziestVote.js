/**
 * Manche bonus : vote populaire pour l'anecdote la plus folle de la partie.
 */
import { action } from '../net.js';
import { esc, checkResponse, timerHtml } from '../ui.js';

export default {
  key: () => 'craziest',

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      <div class="phase-header">
        <span class="badge gold">Manche bonus</span>
        ${timerHtml(g.deadline)}
      </div>

      <section class="card">
        <h2>L'anecdote la plus folle 🤪</h2>
        <p class="muted">Vote pour celle qui t'a le plus marqué. Son auteur gagne +${g.bonus} pts.</p>
      </section>

      <div class="craziest-list" id="list"></div>
      <p class="progress center" id="progress"></p>`;

    el.querySelector('#list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn || btn.disabled) return;
      el.querySelectorAll('[data-id]').forEach((b) => { b.disabled = true; });
      btn.classList.add('selected');
      const ok = checkResponse(await action('craziestVote', { anecdoteId: btn.dataset.id }));
      if (!ok) el.querySelectorAll('[data-id]:not(.mine)').forEach((b) => { b.disabled = false; });
    });
  },

  update(el, s) {
    const g = s.game;
    el.querySelector('#list').innerHTML = g.candidates.map((a) => `
      <button type="button" class="anecdote-option ${a.mine ? 'mine' : ''} ${g.myVote === a.id ? 'selected' : ''}"
              data-id="${a.id}" ${a.mine || g.myVote ? 'disabled' : ''}>
        <span class="anecdote-text">“${esc(a.text)}”</span>
        <small class="muted">— ${esc(a.authorName)}${a.mine ? ' (la tienne)' : ''}</small>
      </button>`).join('');
    el.querySelector('#progress').textContent = `${g.doneIds.length}/${g.expected} ont voté`;
  },
};
