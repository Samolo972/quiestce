const { randomInt } = require('crypto');

// Pas de 0/O ni 1/I/L : les codes doivent se lire à voix haute sans ambiguïté
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Génère un code de room aléatoire, ex. "K7QZ". */
function randomCode(length) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Renvoie une copie mélangée du tableau (Fisher-Yates). */
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = { randomCode, shuffle };
