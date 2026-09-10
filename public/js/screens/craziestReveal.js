/**
 * Dépouillement de la manche bonus : les bulletins sont comptés un par un
 * (effet suspense), puis le gagnant est révélé.
 */
import { esc, renderContinue } from '../ui.js';

let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));

export default {
  key: () => 'craziest-reveal',

  mount(el, s) {
    const g = s.game;
    const counts = Object.fromEntries(g.candidates.map((a) => [a.id, 0]));
    const totalBallots = g.ballots.length;

    el.innerHTML = `
      <div class="phase-header"><span class="badge gold">Manche bonus</span></div>

      <section class="card">
        <h2 id="suspense-title">Dépouillement en cours… 🥁</h2>
        <div class="tally">
          ${g.candidates.map((a) => `
            <div class="tally-row" data-id="${a.id}">
              <div class="tally-text">“${esc(a.text)}” <small class="muted">— ${esc(a.authorName)}</small></div>
              <div class="tally-bar"><span></span></div>
              <b class="tally-count">0</b>
            </div>`).join('')}
        </div>
      </section>

      <section class="card center winner" id="winner" hidden></section>
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
      }, 1000 + i * step);
    });

    const endOfCount = 1000 + totalBallots * step;
    later(() => {
      el.querySelector('#suspense-title').textContent = totalBallots
        ? "Et l'anecdote la plus folle est…"
        : "Personne n'a voté 🤷";
    }, endOfCount);

    later(() => {
      if (!totalBallots) return;
      const winners = g.candidates.filter((a) => g.winnerIds.includes(a.id));
      winners.forEach((a) => row(a.id).classList.add('won'));
      const box = el.querySelector('#winner');
      box.hidden = false;
      box.innerHTML = `
        <div class="big-emoji">🏆</div>
        ${winners.map((a) => `
          <p class="anecdote-text">“${esc(a.text)}”</p>
          <h2 class="pop">${esc(a.authorName)} <span class="badge gold">+${g.bonus} pts</span></h2>`).join('')}
        ${winners.length > 1 ? '<p class="muted">Égalité parfaite !</p>' : ''}`;
    }, endOfCount + 1800);
  },

  update(el, s) {
    renderContinue(el.querySelector('#continue'), s, 'Classement final ▶');
  },

  unmount() {
    timers.forEach(clearTimeout);
    timers = [];
  },
};
