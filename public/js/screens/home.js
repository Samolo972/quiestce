/**
 * Écran d'accueil : créer une partie, en rejoindre une avec un code, ou
 * l'afficher sur un grand écran. Un lien d'invitation /?code=ABCD pré-remplit le code.
 */
import { request, session } from '../net.js';
import { esc, checkResponse, tokenHtml } from '../ui.js';

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

function readCode(el) {
  const code = el.querySelector('#code').value.trim().toUpperCase();
  if (!code) el.querySelector('#code').focus();
  return code;
}

async function send(el, event, data, { spectator = false } = {}) {
  el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const res = await request(event, data);
  el.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  if (!checkResponse(res)) return;
  // De quoi reprendre sa place après une coupure ou un rechargement
  session.set(spectator ? { code: res.code, spectator: true } : { code: res.code, token: res.token });
  history.replaceState(null, '', location.pathname); // on retire ?code= de l'URL
}

export default {
  mount(el) {
    const code = (new URLSearchParams(location.search).get('code') || '').toUpperCase();
    const savedName = sessionStorage.getItem(NAME_KEY) || '';

    el.innerHTML = `
      <section class="brand">
        <div class="brand-tokens" aria-hidden="true">
          ${[0, 1, 2, 3].map((slot) => tokenHtml({ slot })).join('')}
        </div>
        <h1 class="logo-bubble">Qui a dit ça&nbsp;?</h1>
        <p class="tagline">Chacun écrit une anecdote vraie, en secret. Vous débattez, vous votez, et l'auteur est démasqué.</p>
      </section>

      <form class="panel join-panel" id="home-form" autocomplete="off">
        <label class="field">
          <span>Ton pseudo</span>
          <input id="name" maxlength="16" value="${esc(savedName)}" placeholder="Ex : Sam" autocomplete="nickname">
        </label>

        ${code ? '' : `
          <button type="button" class="btn btn-go big block" id="create">Créer une partie</button>
          <div class="divider"><span>ou rejoins tes amis</span></div>`}

        <label class="field">
          <span>Code de la partie</span>
          <input id="code" class="code-input" maxlength="6" value="${esc(code)}" placeholder="ABCD"
                 autocapitalize="characters" spellcheck="false">
        </label>
        <button type="submit" class="btn ${code ? 'btn-go big' : 'btn-ink'} block">Rejoindre</button>

        <div class="divider"><span>télé ou ordinateur</span></div>
        <button type="button" class="btn btn-soft block" id="watch">Afficher la partie sur un grand écran</button>
        <p class="hint small center">L'écran montre les anecdotes et les résultats en grand ; chacun joue sur son téléphone. Pas besoin de pseudo.</p>
      </form>`;

    el.querySelector('#create')?.addEventListener('click', () => {
      const name = readName(el);
      if (name) send(el, 'room:create', { name });
    });

    el.querySelector('#home-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = readName(el);
      if (!name) return;
      const roomCode = readCode(el);
      if (roomCode) send(el, 'room:join', { code: roomCode, name });
    });

    el.querySelector('#watch').addEventListener('click', () => {
      const roomCode = readCode(el);
      if (roomCode) send(el, 'room:watch', { code: roomCode }, { spectator: true });
    });

    el.querySelector('#code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  },
};
