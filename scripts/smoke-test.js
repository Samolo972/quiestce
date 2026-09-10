/**
 * Test de bout en bout : des bots jouent contre le serveur.
 *
 *   npm test                 (lance son propre serveur sur un port de test)
 *   SMOKE_URL=https://jeu.samuel-josephmyrtil.fr npm test   (teste un serveur déjà en ligne)
 *   SMOKE_SCENARIO=2 npm test                              (ne joue que le scénario 2)
 *
 * Scénario 1 : partie complète de 2 manches (2 anecdotes par joueur) + manche
 * bonus. Au début de la manche 2, un joueur quitte : la partie continue sans lui.
 * Scénario 2 : reconnexion, écran partagé, contrôles du host, réactions,
 * arrivée en cours de partie, exclusion, récompenses et limite anti-abus.
 */
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const REMOTE_URL = process.env.SMOKE_URL;
const PORT = 3999;
const URL = REMOTE_URL || `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = 90_000;

let serverProcess = null;
const bots = [];

const log = (...args) => console.log('  ', ...args);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`\n❌ ${msg}`);
  serverProcess?.kill();
  process.exit(1);
};

/** Attend une promesse au plus `ms` millisecondes (le minuteur est bien annulé ensuite). */
async function within(promise, what, ms = 3000) {
  let timer;
  const timedOut = Symbol('timeout');
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(timedOut), ms); });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timer);
  if (result === timedOut) fail(`attente dépassée : ${what}`);
  return result;
}

async function waitFor(condition, what, ms = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) fail(`attente dépassée : ${what}`);
    await wait(25);
  }
}

function startServer() {
  return new Promise((resolve) => {
    const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    server.stdout.on('data', (d) => { if (String(d).includes('lancé')) resolve(server); });
  });
}

function makeBot(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const bot = { name, socket, state: null, id: null };
  socket.on('room:state', (s) => { bot.state = s; bot.id = s.you; bot.onState?.(s); });
  // Rythme "humain" : le serveur freine les rafales (30 événements / 5 s par connexion)
  let nextSlot = 0;
  bot.emit = async (event, data) => {
    const delay = Math.max(0, nextSlot - Date.now());
    nextSlot = Date.now() + delay + 180;
    if (delay) await wait(delay);
    return new Promise((res) => socket.emit(event, data, res));
  };
  bot.rawEmit = (event, data) => new Promise((res) => socket.emit(event, data, res));
  bots.push(bot);
  return bot;
}

// ============================================================== Scénario 1

async function classicScenario() {
  const [alice, bob, chloe] = ['Alice', 'Bob', 'Chloé'].map(makeBot);
  const players = [alice, bob, chloe];
  const seen = new Set();

  // ---- Création + lobby
  const created = await alice.emit('room:create', { name: 'Alice' });
  if (!created.ok) fail(`création : ${created.error}`);
  log('room créée', created.code);

  const early = await alice.emit('room:start');
  if (!early.error) fail('le lancement à 1 joueur aurait dû être refusé');

  for (const bot of [bob, chloe]) {
    const r = await bot.emit('room:join', { code: created.code.toLowerCase(), name: bot.name });
    if (!r.ok) fail(`join ${bot.name} : ${r.error}`);
  }
  const dup = await makeBot('x').emit('room:join', { code: created.code, name: 'alice' });
  if (!dup.error) fail('un pseudo en double aurait dû être refusé');

  const denied = await bob.emit('room:updateSettings', { patch: { rounds: 1 } });
  if (!denied.error) fail("un non-host ne devrait pas modifier les réglages");
  await alice.emit('room:updateSettings', { patch: { rounds: 2, anecdotesPerPlayer: 2, voteTime: 999, hack: true } });
  const settings = alice.state.settings;
  if (settings.voteTime !== alice.state.settingsSchema.voteTime.max || settings.hack) {
    fail(`réglages mal validés : ${JSON.stringify(settings)}`);
  }
  log('réglages validés côté serveur :', JSON.stringify(settings));

  // ---- Chaque bot réagit aux changements de phase
  let done;
  const finished = new Promise((r) => { done = r; });

  for (const bot of players) {
    bot.onState = async (s) => {
      const g = s.game;
      if (!g) return;
      const key = `${bot.name}:${g.phase}:${g.round}:${g.index ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);

      switch (g.phase) {
        case 'submit':
          // Chloé quitte la partie au début de la manche 2 sans rien écrire
          if (bot === chloe && g.round === 2) {
            log('Chloé quitte la partie pendant la manche 2');
            return bot.emit('room:leave');
          }
          // Chaque joueur envoie ses anecdotes une par une (2 par manche dans ce test)
          for (let k = 1; k <= g.perPlayer; k++) {
            const r = await bot.emit('game:action', { type: 'submit', payload: { text: `Anecdote ${k} de ${bot.name}, manche ${g.round}, plutôt folle` } });
            if (r.error) fail(`envoi ${bot.name} : ${r.error}`);
          }
          return;

        case 'debate':
          if (!g.text) fail("l'anecdote doit être affichée en entier pendant le débat");
          if (g.round === 1 && g.count !== 6) fail(`manche 1 : 6 anecdotes attendues (3 joueurs x 2), reçu ${g.count}`);
          if ('authorId' in g) fail("l'auteur ne doit pas être envoyé pendant le débat");
          // Le host écourte le débat ; les votes envoyés avant doivent être refusés
          if (bot === alice) {
            const earlyVote = await bob.emit('game:action', { type: 'vote', payload: { targetId: alice.id } });
            if (!earlyVote.error) fail('un vote pendant le débat aurait dû être refusé');
            return bot.emit('game:action', { type: 'continue' });
          }
          return;

        case 'vote': {
          if ('authorId' in g) fail("l'auteur ne doit pas être envoyé pendant le vote");
          if (g.isAuthor) return;
          const target = s.players.find((p) => p.id !== bot.id);
          const r = await bot.emit('game:action', { type: 'vote', payload: { targetId: target.id } });
          if (r.error) fail(`vote ${bot.name} : ${r.error}`);
          return;
        }

        case 'reveal':
          if (bot === alice) {
            log(`révélation m${g.round} #${g.index} : auteur ${g.authorName}, votes ${g.votes.map((v) => `${v.voterName}->${v.targetName}${v.correct ? `(+${v.points})` : ''}`).join(', ')}${g.undetectable ? ' [indétectable]' : ''}`);
            return bot.emit('game:action', { type: 'continue' });
          }
          return;

        case 'roundEnd':
          if (bot === alice) {
            log(`fin de manche ${g.round} -> ${g.nextStep}`);
            return bot.emit('game:action', { type: 'continue' });
          }
          return;

        case 'craziestVote': {
          const choice = g.candidates.find((a) => !a.mine);
          return bot.emit('game:action', { type: 'craziestVote', payload: { anecdoteId: choice.id } });
        }

        case 'craziestReveal':
          if (bot === alice) {
            log(`manche bonus : ${g.ballots.length} bulletins, gagnant(s) ${g.candidates.filter((a) => g.winnerIds.includes(a.id)).map((a) => a.authorName).join(', ')}`);
            return bot.emit('game:action', { type: 'continue' });
          }
          return;

        case 'end':
          if (bot === alice) done(s);
      }
    };
  }

  const started = await alice.emit('room:start');
  if (!started.ok) fail(`lancement : ${started.error}`);

  const final = await finished;
  players.forEach((b) => { b.onState = null; });
  log('classement final :', final.players.map((p) => `${p.name} ${p.score}`).join(' | '));
  if (final.players.length !== 2) fail('Chloé aurait dû être retirée de la partie');

  const back = await alice.emit('room:backToLobby');
  if (!back.ok || alice.state.phase !== 'lobby') fail('retour au lobby impossible');
}

// ============================================================== Scénario 2

async function featuresScenario() {
  const host = makeBot('Hôte');
  const bob = makeBot('Bob');
  const chloe = makeBot('Chloé');
  const phase = () => host.state?.game?.phase;

  const created = await host.emit('room:create', { name: 'Hôte' });
  if (!created.ok) fail(`création : ${created.error}`);
  const joins = {};
  for (const b of [bob, chloe]) joins[b.name] = await b.emit('room:join', { code: created.code, name: b.name });
  if (!joins.Bob.token) fail('le joueur doit recevoir un jeton de reconnexion');

  // Écran partagé : suit la partie sans être un joueur
  const tv = makeBot('TV');
  const watched = await tv.emit('room:watch', { code: created.code });
  if (!watched.ok || tv.state?.you !== null) fail('écran partagé : vue spectateur attendue');
  if (tv.state.players.length !== 3) fail("l'écran partagé ne doit pas compter comme joueur");

  await host.emit('room:updateSettings', { patch: { rounds: 1, craziestRound: false } });
  await host.emit('room:start');
  await waitFor(() => phase() === 'submit', 'phase d\'écriture');
  await host.emit('game:action', { type: 'submit', payload: { text: "Anecdote de l'hôte, assez longue" } });

  // ---- Reconnexion : Bob perd la connexion puis revient avec son jeton
  bob.socket.disconnect();
  await waitFor(() => host.state.players.find((p) => p.name === 'Bob')?.connected === false, 'Bob hors ligne');
  const bob2 = makeBot('Bob');
  const resumed = await bob2.emit('room:resume', { code: created.code, token: joins.Bob.token });
  if (!resumed.ok || bob2.state?.game?.phase !== 'submit') fail(`reconnexion : ${resumed.error}`);
  if (!host.state.players.find((p) => p.name === 'Bob')?.connected) fail('Bob devrait être de nouveau en ligne');
  const badResume = await makeBot('x').emit('room:resume', { code: created.code, token: 'faux-jeton' });
  if (!badResume.error) fail('un faux jeton aurait dû être refusé');
  if (JSON.stringify(host.state).includes(joins.Bob.token)) fail('le jeton de reconnexion ne doit jamais être diffusé');

  await bob2.emit('game:action', { type: 'submit', payload: { text: 'Anecdote de Bob, assez longue' } });
  await chloe.emit('game:action', { type: 'submit', payload: { text: 'Anecdote de Chloé, assez longue' } });
  await waitFor(() => phase() === 'debate', 'phase de débat');
  if ('authorId' in tv.state.game) fail("l'écran partagé ne doit pas connaître l'auteur");

  // ---- Contrôles du host : +30 s, pause, reprise
  const before = host.state.game.deadline;
  await host.emit('game:action', { type: 'extend' });
  if (host.state.game.deadline < before + 29_000) fail('+30 s non appliquées');
  const notHost = await bob2.emit('game:action', { type: 'extend' });
  if (!notHost.error) fail('seul le host peut rallonger le temps');
  await host.emit('game:action', { type: 'pause' });
  if (!host.state.game.paused || host.state.game.deadline !== null) fail('pause non appliquée');
  await host.emit('game:action', { type: 'pause' });
  if (host.state.game.paused || !host.state.game.deadline) fail('reprise non appliquée');

  // ---- Réactions : diffusées à tous, écran partagé compris
  const received = new Promise((r) => tv.socket.once('room:reaction', r));
  await chloe.emit('game:action', { type: 'react', payload: { emoji: '😂' } });
  const reaction = await within(received, "réaction reçue par l'écran partagé");
  if (reaction?.emoji !== '😂') fail("mauvaise réaction reçue par l'écran partagé");

  // ---- Arrivée en cours de partie, puis exclusion par le host
  const dan = makeBot('Dan');
  const late = await dan.emit('room:join', { code: created.code, name: 'Dan' });
  if (!late.ok || dan.state?.game?.phase !== 'debate') fail(`arrivée en cours de partie : ${late.error}`);
  const kicked = new Promise((r) => dan.socket.once('room:kicked', r));
  const kick = await host.emit('room:kick', { playerId: dan.id });
  if (!kick.ok) fail(`exclusion : ${kick.error}`);
  await within(kicked, 'exclusion reçue par Dan');
  if (host.state.players.some((p) => p.name === 'Dan')) fail('Dan aurait dû être retiré');

  // ---- On termine la partie pour vérifier les récompenses
  for (let i = 0; i < 3; i++) {
    await waitFor(() => phase() === 'debate', 'débat');
    await host.emit('game:action', { type: 'continue' });
    await waitFor(() => phase() === 'vote', 'vote');
    for (const b of [host, bob2, chloe]) {
      const target = b.state.players.find((p) => p.id !== b.id);
      await b.emit('game:action', { type: 'vote', payload: { targetId: target.id } }); // l'auteur est refusé : normal
    }
    await waitFor(() => phase() === 'reveal', 'révélation');
    await host.emit('game:action', { type: 'continue' });
  }
  await waitFor(() => phase() === 'roundEnd', 'fin de manche');
  await host.emit('game:action', { type: 'continue' });
  await waitFor(() => phase() === 'end', 'fin de partie');
  const awards = host.state.game.awards;
  if (!Array.isArray(awards) || awards.length === 0) fail('récompenses de fin absentes');
  log('récompenses :', awards.map((a) => `${a.key}=${a.value}`).join(', '));

  // ---- Anti-abus : une rafale d'événements est freinée
  const burst = await Promise.all(Array.from({ length: 40 }, () => chloe.rawEmit('game:action', { type: 'react', payload: { emoji: '😂' } })));
  if (!burst.some((r) => r?.error?.includes('Doucement'))) fail('la rafale aurait dû être limitée');

  log('reconnexion, écran partagé, +30 s, pause, réactions, arrivée tardive, exclusion, récompenses, limite : OK');
}

// ================================================================= Lancement

async function main() {
  serverProcess = REMOTE_URL ? null : await startServer();
  log(`serveur testé : ${URL}`);
  const timer = setTimeout(() => fail('délai dépassé'), TIMEOUT_MS);

  // SMOKE_SCENARIO=1 ou 2 pour n'en jouer qu'un : utile en ligne, où chaque
  // scénario crée une partie (5 créations max par adresse IP toutes les 10 min)
  const only = process.env.SMOKE_SCENARIO;
  if (!only || only === '1') {
    log('--- Scénario 1 : partie complète');
    await classicScenario();
  }
  if (!only || only === '2') {
    log('--- Scénario 2 : reconnexion, écran partagé, host, réactions, anti-abus');
    await featuresScenario();
  }

  clearTimeout(timer);
  bots.forEach((b) => b.socket.disconnect());
  serverProcess?.kill();
  console.log('\n✅ Tous les scénarios sont passés.');
  process.exit(0);
}

main().catch((err) => fail(err.stack));
