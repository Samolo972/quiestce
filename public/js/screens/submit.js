/**
 * Phase de soumission : chaque joueur écrit son anecdote avant la fin du timer.
 */
import { action } from '../net.js';
import { checkResponse, secondsLeft, toast, phaseHeader, setCounter, tokenHtml, playerById } from '../ui.js';

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
      ${phaseHeader(g.deadline, "À toi d'écrire", { counter: true })}

      <section class="panel" id="write-zone">
        <h2>Raconte une anecdote vraie sur toi</h2>
        <p class="hint">Courte et surprenante. Personne ne saura qu'elle vient de toi… sauf si tu te trahis pendant le débat.</p>
        <textarea id="anecdote" rows="4" maxlength="${g.maxLength}"
          placeholder="Ex : J'ai déjà été coincé deux heures dans un télésiège."></textarea>
        <div class="row between">
          <small class="hint" id="chars">0/${g.maxLength}</small>
          <button type="button" class="btn btn-go" id="send">Envoyer</button>
        </div>
      </section>

      <section class="wait-screen" id="wait-zone" hidden>
        ${tokenHtml(playerById(s, s.you))}
        <h2>Anecdote envoyée</h2>
        <p class="soft">On attend les autres…</p>
      </section>`;

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
    setCounter(el, `${g.doneIds.length}/${g.expected}`, 'envoyées');
    latest = s;
  },

  unmount() {
    clearInterval(autoSendTimer);
  },
};
