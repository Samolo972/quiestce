/**
 * Lobby : joueurs connectés, réglages (modifiables par le host, en lecture
 * seule pour les autres) et lancement de la partie.
 * Le formulaire des réglages est généré depuis state.settingsSchema.
 */
import { request } from '../net.js';
import { esc, toast, checkResponse, plural, tokenHtml, tokenClass } from '../ui.js';

const isHost = (s) => s.hostId === s.you;
let known = new Set(); // joueurs déjà affichés : seuls les nouveaux "sautent" à l'écran

function formatValue(def, value) {
  if (def.type === 'boolean') return value ? 'Oui' : 'Non';
  const n = Number(value);
  // Durées longues plus lisibles : 90 -> "1 min 30"
  if (def.unit === 's' && n >= 60) {
    const sec = n % 60;
    return `${Math.floor(n / 60)} min${sec ? ` ${String(sec).padStart(2, '0')}` : ''}`;
  }
  return `${n}${def.unit ?? ''}`;
}

function settingHtml(key, def, host) {
  const help = def.help ? `<small class="hint">${esc(def.help)}</small>` : '';
  if (!host) {
    return `
      <div class="setting">
        <div class="setting-head"><span>${esc(def.label)}</span><b data-value-for="${key}"></b></div>
        ${help}
      </div>`;
  }
  if (def.type === 'boolean') {
    return `
      <label class="setting switch">
        <span class="setting-head"><span>${esc(def.label)}</span><input type="checkbox" data-key="${key}"></span>
        ${help}
      </label>`;
  }
  return `
    <label class="setting">
      <span class="setting-head"><span>${esc(def.label)}</span><b data-value-for="${key}"></b></span>
      <input type="range" data-key="${key}" min="${def.min}" max="${def.max}" step="${def.step}">
      ${help}
    </label>`;
}

async function share(code) {
  const url = `${location.origin}/?code=${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Qui a dit ça ?', text: `Rejoins ma partie (code ${code}) !`, url });
    } catch { /* partage annulé */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Lien d'invitation copié");
  } catch {
    toast(`Lien : ${url}`);
  }
}

export default {
  // Si le rôle de host change, on reconstruit l'écran (formulaire ou lecture seule)
  key: (s) => (isHost(s) ? 'host' : 'guest'),

  mount(el, s) {
    const host = isHost(s);
    const schema = s.settingsSchema;
    known = new Set();

    el.innerHTML = `
      <section class="pin-panel">
        <p>Code de la partie</p>
        <div class="room-code">${esc(s.code)}</div>
        <button type="button" class="btn btn-ink" id="share">Inviter des joueurs</button>
      </section>

      <section>
        <h2 class="stage-title">Joueurs <span class="count" id="player-count"></span></h2>
        <ul class="player-chips" id="players"></ul>
      </section>

      <section class="panel">
        <h2>Réglages</h2>
        ${host ? '' : '<p class="hint">Choisis par le host.</p>'}
        <div class="settings">
          ${Object.entries(schema).map(([key, def]) => settingHtml(key, def, host)).join('')}
        </div>
      </section>

      <div id="start-zone"></div>`;

    el.querySelector('#share').addEventListener('click', () => share(s.code));

    if (host) {
      const settings = el.querySelector('.settings');
      // Pendant le glissement : on met juste à jour l'affichage local
      settings.addEventListener('input', (e) => {
        const key = e.target.dataset.key;
        if (!key || e.target.type !== 'range') return;
        el.querySelector(`[data-value-for="${key}"]`).textContent = formatValue(schema[key], e.target.value);
      });
      // Au relâchement : on envoie au serveur, qui valide et diffuse à tous
      settings.addEventListener('change', async (e) => {
        const key = e.target.dataset.key;
        if (!key) return;
        const value = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
        checkResponse(await request('room:updateSettings', { patch: { [key]: value } }));
      });

      el.querySelector('#start-zone').addEventListener('click', async (e) => {
        if (e.target.id !== 'start') return;
        e.target.disabled = true;
        const ok = checkResponse(await request('room:start'));
        if (!ok) e.target.disabled = false;
      });
    }
  },

  update(el, s) {
    el.querySelector('#player-count').textContent = `${s.players.length}/${s.maxPlayers}`;
    el.querySelector('#players').innerHTML = s.players.map((p) => {
      const isNew = !known.has(p.id);
      known.add(p.id);
      return `
        <li class="chip ${tokenClass(p)} ${p.id === s.you ? 'me' : ''} ${isNew ? 'new' : ''}">
          ${tokenHtml(p)}
          <span>${esc(p.name)}</span>
          ${p.id === s.hostId ? '<small>host</small>' : ''}
        </li>`;
    }).join('');

    // Valeurs des réglages (sans écraser le curseur que le host est en train de bouger)
    for (const [key, def] of Object.entries(s.settingsSchema)) {
      const value = s.settings[key];
      const label = el.querySelector(`[data-value-for="${key}"]`);
      const input = el.querySelector(`[data-key="${key}"]`);
      if (input && document.activeElement !== input) {
        if (def.type === 'boolean') input.checked = value;
        else input.value = value;
      }
      if (label && document.activeElement !== input) label.textContent = formatValue(def, value);
    }

    const missing = s.minPlayers - s.players.length;
    const zone = el.querySelector('#start-zone');
    if (isHost(s)) {
      zone.innerHTML = `
        <button type="button" class="btn btn-go block big" id="start" ${missing > 0 ? 'disabled' : ''}>Lancer la partie</button>
        ${missing > 0 ? `<p class="continue-note">Encore ${plural(missing, 'joueur')} minimum pour lancer.</p>` : ''}`;
    } else {
      const hostName = s.players.find((p) => p.id === s.hostId)?.name ?? 'le host';
      zone.innerHTML = `<p class="continue-note">En attente du lancement par <b>${esc(hostName)}</b>…</p>`;
    }
  },
};
