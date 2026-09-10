/**
 * Phase de soumission : chaque joueur écrit son anecdote avant la fin du timer.
 */
import { action } from '../net.js';
import { checkResponse, timerHtml, secondsLeft, toast } from '../ui.js';

let autoSendTimer = null;
let sending = false;
let latest = null; // dernier état reçu (le timer d'envoi auto en a besoin)

async function sendAnecdote(el, s, { auto = false } = {}) {
  const textarea = el.querySelector('#anecdote');
  const text = textarea.value.trim();
  if (sending) return;
  if (text.length < s.game.minLength) {
    if (!auto) toast(`Encore un effort : ${s.game.minLength} caractères minimum.`, 'error');
    return;
  }
  sending = true;
  el.querySelector('#send').disabled = true;
  const ok = checkResponse(await action('submit', { text }));
  sending = false;
  if (!ok) el.querySelector('#send').disabled = false;
}

export default {
  key: (s) => s.game.round,

  mount(el, s) {
    const g = s.game;
    sending = false;
    el.innerHTML = `
      <div class="phase-header">
        <span class="badge">Manche ${g.round}/${g.totalRounds}</span>
        ${timerHtml(g.deadline)}
      </div>

      <section class="card" id="write-zone">
        <h2>Raconte une anecdote sur toi ✍️</h2>
        <p class="muted">Vraie, courte et si possible surprenante. Personne ne saura que c'est toi… en principe.</p>
        <textarea id="anecdote" rows="4" maxlength="${g.maxLength}"
          placeholder="Ex : J'ai déjà été coincé 2 heures dans un télésiège."></textarea>
        <div class="row between">
          <span class="muted small" id="chars">0/${g.maxLength}</span>
          <button type="button" class="btn primary" id="send">Envoyer</button>
        </div>
      </section>

      <section class="card center" id="wait-zone" hidden>
        <div class="big-emoji">✅</div>
        <h2>Anecdote envoyée !</h2>
        <p class="muted">On attend les autres…</p>
      </section>

      <p class="progress center" id="progress"></p>`;

    const textarea = el.querySelector('#anecdote');
    textarea.addEventListener('input', () => {
      el.querySelector('#chars').textContent = `${textarea.value.length}/${g.maxLength}`;
    });
    el.querySelector('#send').addEventListener('click', () => sendAnecdote(el, s));

    // Filet de sécurité : si le temps est presque écoulé, on envoie le brouillon
    latest = s;
    autoSendTimer = setInterval(() => {
      if (!latest.game.hasSubmitted && secondsLeft(g.deadline) <= 1) {
        clearInterval(autoSendTimer);
        sendAnecdote(el, s, { auto: true });
      }
    }, 300);
  },

  update(el, s) {
    const g = s.game;
    el.querySelector('#write-zone').hidden = g.hasSubmitted;
    el.querySelector('#wait-zone').hidden = !g.hasSubmitted;
    el.querySelector('#progress').textContent = `${g.doneIds.length}/${g.expected} joueurs ont soumis`;
    latest = s;
  },

  unmount() {
    clearInterval(autoSendTimer);
  },
};
