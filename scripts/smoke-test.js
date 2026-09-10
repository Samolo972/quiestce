/**
 * Test de bout en bout : 3 bots jouent une partie complète contre le serveur.
 *
 *   npm run smoke            (lance son propre serveur sur un port de test)
 *   SMOKE_URL=https://jeu.samuel-josephmyrtil.fr npm run smoke   (teste un serveur déjà en ligne)
 *
 * Scénario : 2 manches + manche bonus. Au début de la manche 2, un bot se
 * déconnecte sans écrire : la partie doit continuer avec les 2 autres.
 */
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const REMOTE_URL = process.env.SMOKE_URL;
const PORT = 3999;
const URL = REMOTE_URL || `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = 30_000;

const log = (...args) => console.log('  ', ...args);
const fail = (msg) => { console.error(`\n❌ ${msg}`); process.exit(1); };

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
  bot.emit = (event, data) => new Promise((res) => socket.emit(event, data, res));
  return bot;
}

async function main() {
  const proc = REMOTE_URL ? null : await startServer();
  log(`serveur testé : ${URL}`);
  const timer = setTimeout(() => fail('délai dépassé'), TIMEOUT_MS);

  const [alice, bob, chloe] = ['Alice', 'Bob', 'Chloé'].map(makeBot);
  const bots = [alice, bob, chloe];
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

  for (const bot of bots) {
    bot.onState = async (s) => {
      const g = s.game;
      if (!g) return;
      const key = `${bot.name}:${g.phase}:${g.round}:${g.index ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);

      switch (g.phase) {
        case 'submit':
          // Chloé part au début de la manche 2 sans rien écrire
          if (bot === chloe && g.round === 2) {
            log('Chloé se déconnecte pendant la manche 2');
            return bot.socket.disconnect();
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
            const early = await bob.emit('game:action', { type: 'vote', payload: { targetId: alice.id } });
            if (!early.error) fail('un vote pendant le débat aurait dû être refusé');
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
  log('classement final :', final.players.map((p) => `${p.name} ${p.score}`).join(' | '));
  if (final.players.length !== 2) fail('Chloé aurait dû être retirée de la partie');

  const back = await alice.emit('room:backToLobby');
  if (!back.ok || alice.state.phase !== 'lobby') fail('retour au lobby impossible');

  clearTimeout(timer);
  bots.forEach((b) => b.socket.disconnect());
  proc?.kill();
  console.log('\n✅ Partie complète jouée sans erreur.');
  process.exit(0);
}

main().catch((err) => fail(err.stack));
