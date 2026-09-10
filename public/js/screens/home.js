/**
 * Écran d'accueil : créer une partie ou en rejoindre une avec un code.
 * Un lien d'invitation /?code=ABCD pré-remplit le code.
 */
import { request } from '../net.js';
import { esc, checkResponse } from '../ui.js';

const NAME_KEY = 'qadc:name';

function readName(el) {
  const name = el.querySelector('#name').value.trim();
  if (!name) {
    el.querySelector('#name').focus();
    return null;
  }
  sessionStorage.setItem(NAME_KEY, name);
  return name;
}

async function send(el, event, data) {
  el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const ok = checkResponse(await request(event, data));
  el.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  // Une fois dans la room, on retire ?code= de l'URL
  if (ok) history.replaceState(null, '', location.pathname);
}

export default {
  mount(el) {
    const code = (new URLSearchParams(location.search).get('code') || '').toUpperCase();
    const savedName = sessionStorage.getItem(NAME_KEY) || '';

    el.innerHTML = `
      <section class="hero">
        <div class="hero-emoji">🤫</div>
        <h1>Qui a dit ça ?</h1>
        <p class="muted">Chacun écrit une anecdote, anonymement. À vous de deviner qui se cache derrière.</p>
      </section>

      <form class="card" id="home-form" autocomplete="off">
        <label class="field">
          <span>Ton pseudo</span>
          <input id="name" maxlength="16" value="${esc(savedName)}" placeholder="Ex : Sam" autocomplete="nickname">
        </label>

        ${code ? '' : '<button type="button" class="btn primary block" id="create">Créer une partie</button><div class="divider"><span>ou</span></div>'}

        <label class="field">
          <span>Code de la partie</span>
          <input id="code" class="code-input" maxlength="6" value="${esc(code)}" placeholder="ABCD"
                 autocapitalize="characters" spellcheck="false">
        </label>
        <button type="submit" class="btn ${code ? 'primary' : ''} block">Rejoindre</button>
      </form>`;

    el.querySelector('#create')?.addEventListener('click', () => {
      const name = readName(el);
      if (name) send(el, 'room:create', { name });
    });

    el.querySelector('#home-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = readName(el);
      const roomCode = el.querySelector('#code').value.trim().toUpperCase();
      if (!name) return;
      if (!roomCode) return el.querySelector('#code').focus();
      send(el, 'room:join', { code: roomCode, name });
    });

    el.querySelector('#code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  },
};
