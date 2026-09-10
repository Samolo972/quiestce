/**
 * Vote après le débat : chacun désigne l'auteur supposé. L'auteur est révélé
 * quand tout le monde a voté (ou à la fin du timer).
 */
import { action } from '../net.js';
import { esc, checkResponse, timerHtml, plural } from '../ui.js';

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    el.innerHTML = `
      <div class="phase-header">
        <span class="badge">Vote · Anecdote ${g.index}/${g.count}</span>
        ${timerHtml(g.deadline)}
      </div>

      <section class="card anecdote-card">
        <p class="anecdote-text">“${esc(g.text)}”</p>
      </section>

      <section class="card" id="vote-zone">
        <h2>Qui a dit ça ?</h2>
        <p class="points-hint" id="points-hint"></p>
        <div class="choices" id="choices"></div>
      </section>

      <section class="card center" id="author-zone" hidden>
        <div class="big-emoji">🤫</div>
        <h2>C'est ton anecdote !</h2>
        <p class="muted">Les autres votent… Verdict dans un instant.</p>
      </section>

      <p class="progress center" id="progress"></p>`;

    el.querySelector('#choices').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-target]');
      if (!btn || btn.disabled) return;
      el.querySelectorAll('[data-target]').forEach((b) => { b.disabled = true; });
      btn.classList.add('selected');
      const ok = checkResponse(await action('vote', { targetId: btn.dataset.target }));
      if (!ok) el.querySelectorAll('[data-target]').forEach((b) => { b.disabled = false; });
    });
  },

  update(el, s) {
    const g = s.game;
    el.querySelector('#author-zone').hidden = !g.isAuthor;
    el.querySelector('#vote-zone').hidden = g.isAuthor;

    if (!g.isAuthor) {
      el.querySelector('#points-hint').innerHTML = g.myVote
        ? 'Vote enregistré ✔️ Réponse quand tout le monde aura voté.'
        : `Un bon vote rapporte <b>${plural(g.points, 'pt')}</b>`;

      // La liste est reconstruite (un joueur a pu partir) ; pas de champ de saisie ici
      el.querySelector('#choices').innerHTML = s.players
        .filter((p) => p.id !== s.you)
        .map((p) => `
          <button type="button" class="choice ${g.myVote === p.id ? 'selected' : ''}"
                  data-target="${p.id}" ${g.myVote ? 'disabled' : ''}>${esc(p.name)}</button>`)
        .join('');
    }

    el.querySelector('#progress').textContent = `${g.votedCount}/${g.expected} ont voté`;
  },
};
