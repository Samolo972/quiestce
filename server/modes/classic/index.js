/**
 * Mode "Qui a dit ça ?" — machine à états d'une partie.
 *
 *   submit ──> debate ──> vote ──> reveal ──> (anecdote suivante…) ──> roundEnd ──> submit (manche suivante)
 *                                                                         │
 *                                                                         └──> craziestVote ──> craziestReveal ──> end
 *
 * Pour chaque anecdote : elle s'affiche en entier et tout le monde en débat
 * (debate), puis chacun vote (vote), puis on révèle l'auteur (reveal).
 *
 * Toutes les transitions passent par setPhase(), qui annule les timers de la
 * phase précédente. Chaque fonction de fin de phase vérifie d'abord qu'on est
 * bien dans la phase attendue : un timer et un dernier vote qui arrivent en
 * même temps ne peuvent donc pas déclencher deux fois la même transition.
 */
const { randomUUID } = require('crypto');
const { SETTINGS_SCHEMA, RULES } = require('./settings');
const { shuffle } = require('../../utils/random');

// ================================================================ Utilitaires

function setPhase(room, phase, durationSec, onTimeout) {
  const game = room.game;
  room.clearAllTimers();
  game.phase = phase;
  game.deadline = durationSec ? Date.now() + durationSec * 1000 : null;
  if (durationSec && onTimeout) room.setTimer('phase', onTimeout, durationSec * 1000);
}

/** Joueurs qui doivent voter sur l'anecdote en cours (tous sauf l'auteur). */
function eligibleVoters(room) {
  const authorId = room.game.current.anecdote.authorId;
  return [...room.players.keys()].filter((id) => id !== authorId);
}

/** Anecdotes proposées à la manche bonus (celles dont l'auteur est encore là). */
function craziestCandidates(room) {
  return room.game.anecdotes.filter((a) => room.getPlayer(a.authorId));
}

/** La manche bonus n'a de sens qu'avec au moins 2 auteurs différents. */
function craziestAvailable(room) {
  if (!room.settings.craziestRound) return false;
  return new Set(craziestCandidates(room).map((a) => a.authorId)).size >= 2;
}

// ================================================================= Démarrage

function start(room) {
  room.game = {
    phase: null,
    deadline: null,
    round: 0,
    totalRounds: room.settings.rounds,
    submissions: new Map(), // manche en cours : playerId -> texte
    anecdotes: [], // toutes les anecdotes de la partie (pour la manche bonus)
    queue: [], // anecdotes restant à jouer dans la manche
    roundIndex: 0, // numéro de l'anecdote en cours dans la manche
    roundTotal: 0,
    current: null, // anecdote en cours de débat / vote / révélation
    nextStep: null, // après roundEnd : 'round' | 'craziest' | 'end'
    craziest: null, // état de la manche bonus
  };
  startRound(room);
}

// ================================================================ Soumission

function startRound(room) {
  const game = room.game;
  game.round += 1;
  game.submissions = new Map();
  setPhase(room, 'submit', room.settings.submitTime, () => endSubmit(room));
  room.broadcast();
}

function submitAnecdote(room, playerId, payload) {
  const game = room.game;
  if (game.phase !== 'submit') return "Ce n'est pas le moment d'écrire.";
  if (game.submissions.has(playerId)) return 'Tu as déjà envoyé ton anecdote.';

  const text = String(payload?.text ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < RULES.ANECDOTE_MIN_LENGTH) {
    return `Ton anecdote doit faire au moins ${RULES.ANECDOTE_MIN_LENGTH} caractères.`;
  }
  if (text.length > RULES.ANECDOTE_MAX_LENGTH) {
    return `Ton anecdote ne doit pas dépasser ${RULES.ANECDOTE_MAX_LENGTH} caractères.`;
  }

  game.submissions.set(playerId, text);
  if (game.submissions.size >= room.players.size) endSubmit(room);
  else room.broadcast();
}

function endSubmit(room) {
  const game = room.game;
  if (game.phase !== 'submit') return;

  const fresh = [];
  for (const [authorId, text] of game.submissions) {
    const author = room.getPlayer(authorId);
    if (!author) continue;
    fresh.push({ id: randomUUID(), authorId, authorName: author.name, text, round: game.round });
  }
  game.anecdotes.push(...fresh);
  game.queue = shuffle(fresh);
  game.roundIndex = 0;
  game.roundTotal = fresh.length;

  if (fresh.length === 0) room.toast("Personne n'a écrit d'anecdote dans cette manche…");
  nextAnecdote(room);
}

// ============================================================= Débat puis vote

/** Affiche l'anecdote suivante en entier et ouvre le débat. */
function nextAnecdote(room) {
  const game = room.game;
  if (room.players.size < 2) return endGame(room, 'Il ne reste plus assez de joueurs.');

  const anecdote = game.queue.shift();
  if (!anecdote) return endRound(room);

  game.roundIndex += 1;
  game.current = {
    anecdote,
    votes: new Map(), // voterId -> targetId
    result: null,
  };
  setPhase(room, 'debate', room.settings.debateTime, () => startVote(room));
  room.broadcast();
}

/** Fin du débat (timer ou host) : place au vote. */
function startVote(room) {
  if (room.game.phase !== 'debate') return;
  setPhase(room, 'vote', room.settings.voteTime, () => endVote(room));
  room.broadcast();
}

function castVote(room, playerId, payload) {
  const game = room.game;
  if (game.phase !== 'vote') return "Ce n'est pas le moment de voter.";
  const current = game.current;
  if (playerId === current.anecdote.authorId) return 'Tu ne peux pas voter sur ta propre anecdote 😉';
  if (current.votes.has(playerId)) return 'Tu as déjà voté.';

  const targetId = payload?.targetId;
  if (targetId === playerId || !room.getPlayer(targetId)) return 'Choix invalide.';

  current.votes.set(playerId, targetId);
  checkVotesComplete(room);
}

function checkVotesComplete(room) {
  const votes = room.game.current.votes;
  if (eligibleVoters(room).every((id) => votes.has(id))) endVote(room);
  else room.broadcast();
}

function endVote(room) {
  const game = room.game;
  if (game.phase !== 'vote') return;
  const current = game.current;
  const authorId = current.anecdote.authorId;

  const votes = [];
  for (const [voterId, targetId] of current.votes) {
    const voter = room.getPlayer(voterId);
    if (!voter) continue;
    const correct = targetId === authorId;
    const points = correct ? RULES.CORRECT_GUESS_POINTS : 0;
    voter.score += points;
    votes.push({
      voterId,
      voterName: voter.name,
      targetId,
      targetName: room.getPlayer(targetId)?.name ?? '(parti)',
      correct,
      points,
    });
  }

  // "Indétectable" : des votes ont eu lieu, mais aucun n'était juste
  const undetectable = votes.length > 0 && !votes.some((v) => v.correct);
  let authorBonus = 0;
  if (undetectable && room.settings.undetectableBonus) {
    authorBonus = RULES.UNDETECTABLE_BONUS;
    room.getPlayer(authorId).score += authorBonus;
  }

  current.result = { votes, undetectable, authorBonus };
  setPhase(room, 'reveal', RULES.REVEAL_DURATION, () => nextAnecdote(room));
  room.broadcast();
}

// ================================================================ Fin de manche

function endRound(room) {
  const game = room.game;
  game.current = null;
  if (game.round < game.totalRounds) game.nextStep = 'round';
  else game.nextStep = craziestAvailable(room) ? 'craziest' : 'end';

  setPhase(room, 'roundEnd', RULES.ROUND_END_DURATION, () => leaveRoundEnd(room));
  room.broadcast();
}

function leaveRoundEnd(room) {
  if (room.game.phase !== 'roundEnd') return;
  if (room.game.nextStep === 'round') return startRound(room);
  if (craziestAvailable(room)) return startCraziest(room);
  endGame(room);
}

// =========================================== Manche bonus "anecdote la plus folle"

function startCraziest(room) {
  room.game.craziest = { votes: new Map(), result: null }; // voterId -> anecdoteId
  setPhase(room, 'craziestVote', room.settings.voteTime, () => endCraziest(room));
  room.broadcast();
}

function voteCraziest(room, playerId, payload) {
  const game = room.game;
  if (game.phase !== 'craziestVote') return 'Le vote est terminé.';
  if (game.craziest.votes.has(playerId)) return 'Tu as déjà voté.';

  const anecdote = craziestCandidates(room).find((a) => a.id === payload?.anecdoteId);
  if (!anecdote) return 'Choix invalide.';
  if (anecdote.authorId === playerId) return 'Pas de vote pour ta propre anecdote 😉';

  game.craziest.votes.set(playerId, anecdote.id);
  if (game.craziest.votes.size >= room.players.size) endCraziest(room);
  else room.broadcast();
}

function endCraziest(room) {
  const game = room.game;
  if (game.phase !== 'craziestVote') return;

  const candidates = craziestCandidates(room);
  const counts = new Map(candidates.map((a) => [a.id, 0]));
  const ballots = [];
  for (const anecdoteId of game.craziest.votes.values()) {
    if (!counts.has(anecdoteId)) continue;
    counts.set(anecdoteId, counts.get(anecdoteId) + 1);
    ballots.push(anecdoteId);
  }

  // En cas d'égalité, tous les ex æquo gagnent (bonus une seule fois par auteur)
  const max = Math.max(0, ...counts.values());
  const winners = max > 0 ? candidates.filter((a) => counts.get(a.id) === max) : [];
  const rewarded = new Set();
  for (const w of winners) {
    if (rewarded.has(w.authorId)) continue;
    rewarded.add(w.authorId);
    room.getPlayer(w.authorId).score += RULES.CRAZIEST_BONUS;
  }

  game.craziest.result = {
    // Bulletins dans un ordre aléatoire : le client les dépouille un par un
    ballots: shuffle(ballots),
    winnerIds: winners.map((a) => a.id),
    bonus: RULES.CRAZIEST_BONUS,
    candidates: candidates.map((a) => ({
      id: a.id, text: a.text, authorName: a.authorName, votes: counts.get(a.id),
    })),
  };
  setPhase(room, 'craziestReveal', RULES.CRAZIEST_REVEAL_DURATION, () => endGame(room));
  room.broadcast();
}

// ================================================================= Fin de partie

function endGame(room, reason) {
  if (reason) room.toast(reason);
  setPhase(room, 'end', null);
  room.broadcast();
}

// ======================================================= Actions des joueurs

/** Le host peut écourter le débat et les écrans de transition. */
function hostContinue(room, playerId) {
  if (!room.isHost(playerId)) return 'Seul le host peut passer à la suite.';
  switch (room.game.phase) {
    case 'debate': return startVote(room);
    case 'reveal': return nextAnecdote(room);
    case 'roundEnd': return leaveRoundEnd(room);
    case 'craziestReveal': return endGame(room);
    default: return 'Rien à passer pour le moment.';
  }
}

const ACTIONS = {
  submit: submitAnecdote,
  vote: castVote,
  craziestVote: voteCraziest,
  continue: hostContinue,
};

function handleAction(room, playerId, type, payload) {
  const action = ACTIONS[type];
  if (!action) return 'Action inconnue.';
  return action(room, playerId, payload);
}

// ================================================================ Déconnexions

/** Appelé après le retrait du joueur de la room : la partie continue sans lui. */
function onPlayerLeave(room, playerId, player) {
  const game = room.game;
  if (game.phase === 'end') return room.broadcast();

  // Ses anecdotes pas encore jouées disparaissent
  game.queue = game.queue.filter((a) => a.authorId !== playerId);

  if (room.players.size < 2) {
    return endGame(room, 'Il ne reste plus assez de joueurs, fin de la partie.');
  }

  switch (game.phase) {
    case 'submit':
      game.submissions.delete(playerId);
      if (game.submissions.size >= room.players.size) return endSubmit(room);
      break;

    case 'debate':
    case 'vote':
      if (game.current.anecdote.authorId === playerId) {
        room.toast(`L'auteur de cette anecdote (${player.name}) est parti : on passe à la suite !`);
        return nextAnecdote(room);
      }
      if (game.phase === 'vote') {
        game.current.votes.delete(playerId); // on retire son vote en attente
        return checkVotesComplete(room); // il était peut-être le dernier attendu
      }
      break;

    case 'craziestVote': {
      const votes = game.craziest.votes;
      votes.delete(playerId);
      if (!craziestAvailable(room)) return endGame(room);
      // Les votes pour ses anecdotes sont annulés : ces joueurs pourront revoter
      const validIds = new Set(craziestCandidates(room).map((a) => a.id));
      for (const [voterId, anecdoteId] of votes) {
        if (!validIds.has(anecdoteId)) votes.delete(voterId);
      }
      if (votes.size >= room.players.size) return endCraziest(room);
      break;
    }
  }
  room.broadcast();
}

// ============================================================ Vue par joueur

/**
 * Ce que voit un joueur. Ne jamais y mettre ce qui doit rester secret :
 * l'auteur avant la révélation, qui a voté pour qui…
 */
function getView(room, playerId) {
  const game = room.game;
  const base = {
    phase: game.phase,
    round: game.round,
    totalRounds: game.totalRounds,
    deadline: game.deadline,
  };

  switch (game.phase) {
    case 'submit':
      return {
        ...base,
        hasSubmitted: game.submissions.has(playerId),
        doneIds: [...game.submissions.keys()],
        expected: room.players.size,
        minLength: RULES.ANECDOTE_MIN_LENGTH,
        maxLength: RULES.ANECDOTE_MAX_LENGTH,
      };

    case 'debate':
    case 'vote': {
      const current = game.current;
      const view = {
        ...base,
        index: game.roundIndex,
        count: game.roundTotal,
        text: current.anecdote.text,
        isAuthor: current.anecdote.authorId === playerId,
      };
      if (game.phase === 'debate') return view;
      return {
        ...view,
        myVote: current.votes.get(playerId) ?? null,
        points: RULES.CORRECT_GUESS_POINTS,
        // Seulement un compteur : la liste de qui a voté trahirait l'auteur par élimination
        votedCount: current.votes.size,
        expected: eligibleVoters(room).length,
      };
    }

    case 'reveal': {
      const { anecdote, result } = game.current;
      return {
        ...base,
        index: game.roundIndex,
        count: game.roundTotal,
        text: anecdote.text,
        authorId: anecdote.authorId,
        authorName: anecdote.authorName,
        ...result,
      };
    }

    case 'roundEnd':
      return { ...base, nextStep: game.nextStep };

    case 'craziestVote':
      return {
        ...base,
        candidates: craziestCandidates(room).map((a) => ({
          id: a.id, text: a.text, authorName: a.authorName, mine: a.authorId === playerId,
        })),
        myVote: game.craziest.votes.get(playerId) ?? null,
        doneIds: [...game.craziest.votes.keys()],
        expected: room.players.size,
        bonus: RULES.CRAZIEST_BONUS,
      };

    case 'craziestReveal':
      return { ...base, ...game.craziest.result };

    default: // 'end'
      return base;
  }
}

module.exports = {
  id: 'classic',
  name: 'Qui a dit ça ?',
  settingsSchema: SETTINGS_SCHEMA,
  start,
  handleAction,
  onPlayerLeave,
  getView,
};
