/**
 * Amorces proposées par le bouton "Besoin d'une idée ?" de l'écran d'écriture.
 */
export const PROMPTS = [
  'Une fois où tu as eu très honte…',
  'Ton pire job ou petit boulot…',
  'Un talent caché que personne ne soupçonne…',
  'La chose la plus bizarre que tu aies mangée…',
  'Une rencontre improbable avec une célébrité…',
  "Ta plus grosse bêtise d'enfant…",
  'Un voyage qui a mal tourné…',
  'Une peur irrationnelle…',
  'Le pire rendez-vous amoureux…',
  "Une fois où tu t'es complètement perdu…",
  'Un mensonge qui est allé beaucoup trop loin…',
  "Un objet que tu as cassé sans jamais l'avouer…",
  'Ta pire coupe de cheveux…',
  'Un record personnel ridicule…',
  "Une fois où on t'a pris pour quelqu'un d'autre…",
  'Une histoire avec un animal…',
  'Un cadeau complètement raté…',
  'La fois où tu as le plus ri de ta vie…',
  'Un accident domestique mémorable…',
  'Une compétence inutile que tu maîtrises…',
  'Ta plus grosse frayeur…',
  'Une mode que tu as suivie et que tu regrettes…',
  'Un plat que tu as raté de façon spectaculaire…',
  "Une fois où tu t'es retrouvé enfermé quelque part…",
  'Un surnom que tu as eu, et son histoire…',
  'Un endroit insolite où tu as dormi…',
  "Une fois où tu t'es fait remarquer en public…",
  'Une règle que tu as enfreinte…',
];

/** Une amorce au hasard, différente de la précédente. */
export function randomPrompt(previous) {
  let prompt;
  do {
    prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  } while (prompt === previous);
  return prompt;
}
