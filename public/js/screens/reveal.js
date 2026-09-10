/**
 * Révélation : le vrai auteur, qui a voté pour qui et les points gagnés.
 */
import { esc, renderContinue, plural } from '../ui.js';

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    const isMe = g.authorId === s.you;
    const myVote = g.votes.find((v) => v.voterId === s.you);

    let personal = '';
    if (isMe) personal = g.undetectable ? 'Personne ne t\'a démasqué 😎' : 'Démasqué ! 🙈';
    else if (myVote) personal = myVote.correct ? `Bien vu ! +${plural(myVote.points, 'pt')} 🎉` : 'Raté… 😅';
    else personal = "Tu n'as pas voté 💤";

    el.innerHTML = `
      <div class="phase-header">
        <span class="badge">Révélation · ${g.index}/${g.count}</span>
      </div>

      <section class="card anecdote-card">
        <p class="anecdote-text">“${esc(g.text)}”</p>
      </section>

      <section class="card center">
        <p class="muted">C'était…</p>
        <h1 class="author-name pop">${esc(g.authorName)}${isMe ? ' (toi !)' : ''}</h1>
        ${g.undetectable ? `<p class="badge gold">🕵️ Indétectable !${g.authorBonus ? ` +${plural(g.authorBonus, 'pt')} pour ${esc(g.authorName)}` : ''}</p>` : ''}
        <p class="personal">${personal}</p>
      </section>

      <section class="card">
        <h3>Les votes</h3>
        ${g.votes.length ? `
          <ul class="vote-list">
            ${g.votes.map((v) => `
              <li class="${v.correct ? 'ok' : 'ko'}">
                <span><b>${esc(v.voterName)}</b> → ${esc(v.targetName)}</span>
                <span>${v.correct ? `✅ +${v.points}` : '❌'}</span>
              </li>`).join('')}
          </ul>` : '<p class="muted">Personne n\'a voté.</p>'}
      </section>

      <div id="continue"></div>`;
  },

  update(el, s) {
    renderContinue(el.querySelector('#continue'), s, 'Anecdote suivante ▶');
  },
};
