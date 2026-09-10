/**
 * Phase de vote avec indices progressifs : les fragments de l'anecdote
 * arrivent un par un depuis le serveur ; plus on vote tôt, plus ça rapporte.
 */
import { action } from '../net.js';
import { esc, checkResponse, timerHtml, plural } from '../ui.js';

let shownFragments = 0; // pour n'animer que les nouveaux fragments

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    shownFragments = 0;
    el.innerHTML = `
      <div class="phase-header">
        <span class="badge">Anecdote ${g.index}/${g.count} · Manche ${g.round}/${g.totalRounds}</span>
        ${timerHtml(g.deadline)}
      </div>

      <section class="card anecdote-card">
        <p class="fragments" id="fragments"></p>
        <p class="hint-info muted small" id="hint-info"></p>
      </section>

      <section class="card" id="vote-zone">
        <h2>Qui a dit ça ?</h2>
        <p class="points-hint" id="points-hint"></p>
        <div class="choices" id="choices"></div>
      </section>

      <section class="card center" id="author-zone" hidden>
        <div class="big-emoji">🤫</div>
        <h2>C'est ton anecdote !</h2>
        <p class="muted">Garde ton sérieux pendant que les autres votent.</p>
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

    // Fragments révélés + emplacements masqués pour ceux à venir
    const hidden = g.totalFragments - g.fragments.length;
    el.querySelector('#fragments').innerHTML =
      g.fragments.map((f, i) => `<span class="fragment ${i >= shownFragments ? 'new' : ''}">${esc(f)}</span>`).join(' ')
      + ' ' + '<span class="fragment masked">•••</span> '.repeat(hidden);
    shownFragments = g.fragments.length;

    el.querySelector('#hint-info').innerHTML = g.nextHintAt
      ? `Indice ${g.fragments.length}/${g.totalFragments} · prochain dans ${timerHtml(g.nextHintAt, 'timer inline')}`
      : 'Anecdote complète 👀';

    el.querySelector('#author-zone').hidden = !g.isAuthor;
    el.querySelector('#vote-zone').hidden = g.isAuthor;

    if (!g.isAuthor) {
      el.querySelector('#points-hint').innerHTML = g.myVote
        ? 'Vote enregistré ✔️ Réponse à la fin du vote.'
        : `Vote maintenant : <b>${plural(g.potentialPoints, 'pt')}</b> si tu as juste`;

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
