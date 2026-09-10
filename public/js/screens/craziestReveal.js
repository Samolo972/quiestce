/**
 * Dépouillement de la manche bonus : les bulletins sont comptés un par un
 * (effet suspense), puis le gagnant est révélé.
 */
import { esc, renderContinue, plural, tokenHtml, tokenClass, playerById, reactionBar } from '../ui.js';
import { play } from '../sound.js';

let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));

export default {
  key: () => 'craziest-reveal',

  mount(el, s) {
    const g = s.game;
    const counts = Object.fromEntries(g.candidates.map((a) => [a.id, 0]));
    const totalBallots = g.ballots.length;

    el.innerHTML = `
      <h1 class="screen-title" id="suspense-title">Dépouillement…</h1>

      <div class="tally">
        ${g.candidates.map((a) => {
          const author = playerById(s, a.authorId);
          return `
            <div class="tally-row ${tokenClass(author)}" data-id="${a.id}">
              <div class="tally-text">
                «&nbsp;${esc(a.text)}&nbsp;»
                <div class="by">${tokenHtml(author)}${esc(a.authorName)}</div>
              </div>
              <div class="tally-bar"><span></span></div>
              <b class="tally-count">0</b>
            </div>`;
        }).join('')}
      </div>

      <div id="winner" hidden></div>
      ${reactionBar(s)}
      <div id="continue"></div>`;

    const row = (id) => el.querySelector(`.tally-row[data-id="${id}"]`);

    // Un bulletin toutes les ~0,8 s (plus rapide s'il y en a beaucoup)
    const step = Math.min(900, 6000 / Math.max(1, totalBallots));
    g.ballots.forEach((id, i) => {
      later(() => {
        counts[id] += 1;
        const r = row(id);
        r.querySelector('.tally-count').textContent = counts[id];
        r.querySelector('.tally-bar span').style.width = `${(counts[id] / totalBallots) * 100}%`;
        r.classList.remove('bump');
        void r.offsetWidth; // relance l'animation CSS
        r.classList.add('bump');
        play('ballot');
      }, 1000 + i * step);
    });

    const endOfCount = 1000 + totalBallots * step;
    later(() => {
      el.querySelector('#suspense-title').textContent = totalBallots
        ? "Et l'anecdote la plus folle est…"
        : "Personne n'a voté";
    }, endOfCount);

    later(() => {
      if (!totalBallots) return;
      el.querySelectorAll('.tally-row').forEach((r) => {
        r.classList.add(g.winnerIds.includes(r.dataset.id) ? 'won' : 'lost');
      });
      // L'anecdote gagnante est déjà mise en avant dans le décompte : on annonce juste son auteur
      const winners = g.candidates.filter((a) => g.winnerIds.includes(a.id));
      const box = el.querySelector('#winner');
      box.hidden = false;
      box.innerHTML = winners.map((a) => `
        <div class="speaker">
          <span class="flip">${tokenHtml(playerById(s, a.authorId))}</span>
          <span><span class="speaker-name">${esc(a.authorName)}</span> gagne ${plural(g.bonus, 'point')}</span>
        </div>`).join('');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      play('win');
    }, endOfCount + 1800);
  },

  update(el, s) {
    renderContinue(el.querySelector('#continue'), s, 'Classement final');
  },

  unmount() {
    timers.forEach(clearTimeout);
    timers = [];
  },
};
