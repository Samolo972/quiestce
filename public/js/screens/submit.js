/**
 * Phase d'écriture : chaque joueur écrit ses anecdotes (une ou plusieurs,
 * selon le réglage du lobby), une à la fois, avant la fin du timer.
 */
import { action } from '../net.js';
import { checkResponse, secondsLeft, toast, phaseHeader, setCounter, tokenHtml, playerById, plural } from '../ui.js';

let autoSendTimer = null;
let sending = false;
let latest = null; // dernier état reçu (l'envoi et le timer en ont besoin)

async function sendAnecdote(el, { auto = false } = {}) {
  const g = latest.game;
  const textarea = el.querySelector('#anecdote');
  const text = textarea.value.trim();
  if (sending || g.hasSubmitted) return;
  if (text.length < g.minLength) {
    if (!auto) toast(`Encore un effort : ${g.minLength} caractères minimum.`, 'error');
    return;
  }
  sending = true;
  el.querySelector('#send').disabled = true;
  const ok = checkResponse(await action('submit', { text }));
  sending = false;
  el.querySelector('#send').disabled = false;
  if (ok) {
    // Champ vidé pour l'anecdote suivante
    textarea.value = '';
    textarea.dispatchEvent(new Event('input'));
    if (!auto) textarea.focus();
  }
}

export default {
  key: (s) => s.game.round,

  mount(el, s) {
    const g = s.game;
    const several = g.perPlayer > 1;
    sending = false;
    latest = s;

    el.innerHTML = `
      ${phaseHeader(g.deadline, "À toi d'écrire", { counter: true })}

      <section class="panel" id="write-zone">
        <div class="row between">
          <h2 id="write-title"></h2>
          <span class="dots" id="dots" aria-hidden="true"></span>
        </div>
        <p class="hint">
          ${several
            ? `Écris ${plural(g.perPlayer, 'anecdote')} vraies sur toi, une à la fois, courtes et surprenantes. Personne ne saura qu'elles viennent de toi…`
            : "Courte et surprenante. Personne ne saura qu'elle vient de toi…"}
          sauf si tu te trahis pendant le débat.
        </p>
        <textarea id="anecdote" rows="4" maxlength="${g.maxLength}"
          placeholder="Ex : J'ai déjà été coincé deux heures dans un télésiège."></textarea>
        <div class="row between">
          <small class="hint" id="chars">0/${g.maxLength}</small>
          <button type="button" class="btn btn-go" id="send">Envoyer</button>
        </div>
      </section>

      <section class="wait-screen" id="wait-zone" hidden>
        ${tokenHtml(playerById(s, s.you))}
        <h2>${several ? 'Anecdotes envoyées' : 'Anecdote envoyée'}</h2>
        <p class="soft">On attend les autres…</p>
      </section>`;

    const textarea = el.querySelector('#anecdote');
    textarea.addEventListener('input', () => {
      el.querySelector('#chars').textContent = `${textarea.value.length}/${g.maxLength}`;
    });
    el.querySelector('#send').addEventListener('click', () => sendAnecdote(el));

    // Filet de sécurité : si le temps est presque écoulé, on envoie le brouillon en cours
    autoSendTimer = setInterval(() => {
      if (!latest.game.hasSubmitted && secondsLeft(g.deadline) <= 1) {
        clearInterval(autoSendTimer);
        sendAnecdote(el, { auto: true });
      }
    }, 300);
  },

  update(el, s) {
    const g = s.game;
    latest = s;
    el.querySelector('#write-zone').hidden = g.hasSubmitted;
    el.querySelector('#wait-zone').hidden = !g.hasSubmitted;
    setCounter(el, `${g.doneIds.length}/${g.expected}`, 'prêts');

    const n = g.perPlayer;
    el.querySelector('#write-title').textContent = n > 1
      ? `Anecdote ${Math.min(g.submittedCount + 1, n)} sur ${n}`
      : 'Raconte une anecdote vraie sur toi';
    el.querySelector('#dots').innerHTML = n > 1
      ? Array.from({ length: n }, (_, i) => `<i class="${i < g.submittedCount ? 'on' : ''}"></i>`).join('')
      : '';
  },

  unmount() {
    clearInterval(autoSendTimer);
  },
};
