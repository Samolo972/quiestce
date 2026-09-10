/**
 * Révélation : bandeau de résultat personnel, le "?" se retourne pour
 * montrer l'auteur, puis le détail des votes.
 */
import { esc, renderContinue, plural, bubbleHtml, tokenHtml, playerById } from '../ui.js';

/** Bandeau du haut, propre à chaque joueur. */
function bannerFor(s) {
  const g = s.game;
  const myVote = g.votes.find((v) => v.voterId === s.you);
  if (g.authorId === s.you) {
    return g.undetectable
      ? { cls: 'ok', title: 'Indétectable&nbsp;!', sub: g.authorBonus ? `+${plural(g.authorBonus, 'point')} pour toi` : "Personne ne t'a démasqué" }
      : { cls: 'ko', title: 'Démasqué&nbsp;!', sub: 'Ton anecdote t\'a trahi' };
  }
  if (!myVote) return { cls: 'neutral', title: 'Pas de vote', sub: 'Tu as laissé passer ton tour' };
  return myVote.correct
    ? { cls: 'ok', title: 'Bien vu&nbsp;!', sub: `+${plural(myVote.points, 'point')}` }
    : { cls: 'ko', title: 'Raté', sub: `Tu avais désigné ${esc(myVote.targetName)}` };
}

export default {
  key: (s) => `${s.game.round}-${s.game.index}`,

  mount(el, s) {
    const g = s.game;
    const banner = bannerFor(s);
    const isMe = g.authorId === s.you;

    el.innerHTML = `
      <div class="result-banner ${banner.cls}"><b>${banner.title}</b><span>${banner.sub}</span></div>

      ${bubbleHtml(g.text)}
      <div class="speaker">
        <span class="flip">${tokenHtml(playerById(s, g.authorId))}</span>
        <span><span class="speaker-name">${esc(g.authorName)}</span> ${isMe ? "(toi) l'a écrite" : "l'a écrite"}</span>
      </div>

      ${g.undetectable && !isMe
        ? `<p class="badge">Personne ne l'a démasqué${g.authorBonus ? ` : +${plural(g.authorBonus, 'point')} pour ${esc(g.authorName)}` : ''}</p>`
        : ''}

      <section class="panel">
        <h3>Les votes</h3>
        ${g.votes.length ? `
          <ul class="vote-list">
            ${g.votes.map((v) => `
              <li class="${v.correct ? 'ok' : 'ko'}">
                ${tokenHtml(playerById(s, v.voterId))}<b>${esc(v.voterName)}</b>
                <span class="hint">a désigné</span>
                ${tokenHtml(playerById(s, v.targetId))}<b>${esc(v.targetName)}</b>
                <span class="verdict">${v.correct ? `✓ +${v.points}` : '✕'}</span>
              </li>`).join('')}
          </ul>` : '<p class="hint">Personne n\'a voté.</p>'}
      </section>

      <div id="continue"></div>`;
  },

  update(el, s) {
    renderContinue(el.querySelector('#continue'), s, 'Anecdote suivante');
  },
};
