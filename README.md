# Qui a dit ça ?

Jeu web multijoueur en temps réel : chacun écrit une anecdote anonyme, puis
chaque anecdote s'affiche à tout le monde. Vous en débattez, vous votez, et
l'auteur est révélé.

Stack : Node.js + Express + Socket.io, front en HTML/CSS/JS vanilla (modules ES,
aucun build). Tout l'état des parties vit en mémoire.

## Lancer en local

```bash
npm install
npm run dev          # http://localhost:3001 (redémarre à chaque modif du serveur)
npm test             # des bots jouent des parties complètes contre le serveur
```

Pour tester depuis un téléphone sur le même Wi-Fi : `http://<IP-du-PC>:3001`.
Pour tester avec seulement 2 onglets : `MIN_PLAYERS=2 npm run dev`
(PowerShell : `$env:MIN_PLAYERS=2; npm run dev`).

Variables d'environnement : `PORT` (défaut 3001), `HOST` (défaut : toutes les
interfaces), `MIN_PLAYERS` (défaut 3).

À chaque push sur `main`, GitHub Actions vérifie la syntaxe et rejoue ces
parties (`.github/workflows/ci.yml`).

## Déroulé d'une partie

1. **Lobby** : les joueurs rejoignent avec un code à 4 caractères, un lien ou un
   QR code ; le host règle la partie.
2. **Écriture** : chacun écrit une ou plusieurs anecdotes sur lui (nombre choisi
   par le host), une à la fois, anonymement. Un bouton propose des idées.
3. Pour chaque anecdote, dans un ordre aléatoire :
   - **Débat** : l'anecdote s'affiche en entier chez tout le monde, on en discute
     pendant le temps choisi par le host (qui peut aussi passer au vote plus tôt) ;
   - **Vote** : chacun désigne l'auteur supposé (sauf l'auteur lui-même) ;
   - **Révélation** : une fois tous les votes reçus, on découvre l'auteur et qui a voté pour qui.
4. Autant de manches que réglé : chaque manche recommence par l'écriture.
   Exemple : 1 manche avec 3 anecdotes par joueur.
5. **Manche bonus** (optionnelle) : vote pour l'anecdote la plus folle de la partie,
   avec dépouillement en direct.
6. **Podium** final et récompenses : meilleur détective, maître du mystère, le plus crédule.

### Autour du jeu

- **Écran partagé** : une télé ou un ordinateur peut « afficher la partie sur un
  grand écran » depuis l'accueil (code seulement, sans pseudo). Il montre tout en
  grand, ne compte pas comme joueur et ne reçoit jamais d'information secrète.
- **Reconnexion** : l'écran reste allumé pendant la partie (Wake Lock). En cas de
  coupure, le joueur garde sa place et ses points 60 s ; son téléphone le
  reconnecte automatiquement. On ne l'attend pas pour finir une étape.
- **Arrivée en cours de partie** : on peut rejoindre à tout moment.
- **Contrôles du host** : +30 s, pause / reprise, passer à la suite, retirer un
  joueur (depuis le tableau des scores).
- **Ambiance** : réactions emoji anonymes pendant le débat et la révélation,
  petits sons et vibrations (coupables depuis la barre du haut).

### Réglages du host

| Réglage | Plage | Défaut |
|---|---|---|
| Anecdotes à écrire par joueur | 1 – 5 | 1 |
| Temps d'écriture par anecdote (multiplié par le nombre d'anecdotes) | 30 s – 2 min | 1 min |
| Temps de débat par anecdote | 30 s – 5 min | 1 min 30 |
| Temps de vote après le débat | 15 – 60 s | 30 s |
| Nombre de manches | 1 – 5 | 2 |
| Bonus « indétectable » | oui / non | oui |
| Manche bonus « anecdote la plus folle » | oui / non | oui |

### Points

| Situation | Points |
|---|---|
| Bon vote | +1 |
| Auteur que personne n'a démasqué (si activé) | +1 |
| Anecdote la plus folle (manche bonus, ex æquo inclus) | +2 |

Les valeurs se modifient dans `RULES` (`server/modes/classic/settings.js`).

## Architecture

```
server/
  index.js              HTTP + Socket.io + fichiers statiques + QR codes (/qr/:code)
  config.js             constantes globales (joueurs, reconnexion, limites anti-abus)
  socket.js             événements communs : créer/rejoindre/reprendre/quitter/écran partagé/réglages/exclure
  rooms/Room.js         état d'une room : joueurs, reconnexion, écrans partagés, timers, diffusion
  rooms/roomManager.js  registre des rooms en mémoire (Map code -> Room)
  modes/index.js        registre des modes de jeu
  modes/classic/        mode "Qui a dit ça ?"
    index.js            machine à états : submit -> debate -> vote -> reveal -> roundEnd -> craziest -> end
    settings.js         schéma des réglages du lobby + règles fixes (points, durées)
public/
  index.html, css/style.css
  fonts/                police Baloo 2 hébergée localement (licence OFL)
  js/main.js            choisit l'écran, reconnexion, écran allumé, réactions, barre du host
  js/net.js, store.js   socket, session de reconnexion, horloge serveur, état client
  js/ui.js              échappement HTML, jetons des joueurs, comptes à rebours
  js/sound.js           sons synthétisés et vibrations
  js/prompts.js         idées d'anecdotes
  js/scoreboard.js      scores permanents
  js/screens/*.js       un fichier par écran
scripts/smoke-test.js   parties jouées par des bots (npm test)
deploy/                 exemples nginx (WebSocket) + service systemd
```

### Principes

- **Le serveur fait autorité.** À chaque changement, il envoie à chaque joueur
  `room:state`, une vue *filtrée pour lui* (`mode.getView`) ; un écran partagé
  reçoit la vue publique (`getView(room, null)`). L'auteur d'une anecdote ne
  quitte jamais le serveur avant la révélation, et pendant le vote on ne voit
  que le nombre de votants (pas qui a voté, ce qui trahirait l'auteur).
- **Deux identifiants par joueur** : `id` est public (il sert à le désigner),
  `token` est secret (il sert à se reconnecter) et n'est jamais diffusé.
- **Les timers tournent côté serveur** (`room.setTimer`) avec les valeurs du lobby.
  Le client reçoit seulement des échéances (`deadline`) et affiche le décompte,
  corrigé du décalage d'horloge du téléphone.
- **Une seule action de jeu générique** : `game:action { type, payload }`, routée
  vers le mode actif. Ajouter une mécanique = ajouter une entrée dans `ACTIONS`.
- **Réglages pilotés par un schéma** (`modes/classic/settings.js`) : il sert à la
  fois à valider côté serveur et à générer le formulaire du lobby.

### Ajouter un mode de jeu

Créer `server/modes/<id>/index.js` qui exporte `id`, `name`, `settingsSchema`,
`start`, `handleAction`, `onPlayerLeave` et `getView` (contrat détaillé dans
`server/modes/index.js`), l'enregistrer dans `MODES`, puis ajouter les écrans
correspondant à ses phases dans `public/js/screens/` et `SCREENS` (`main.js`).

## Protections

- Limite de débit par connexion (30 événements / 5 s).
- 5 créations de partie par adresse IP toutes les 10 minutes, 300 parties
  simultanées au maximum, 4 écrans partagés par partie.
- Parties sans activité depuis 3 h supprimées automatiquement.
- Entrées validées côté serveur et échappées à l'affichage (pas d'injection HTML).

## Limites connues

- **Mémoire uniquement.** Un redémarrage du serveur coupe les parties en cours.
  Une base (SQLite…) ne deviendrait utile que pour des données durables
  (historique, statistiques).
- **Une seule instance.** Pour en faire tourner plusieurs, il faudrait Redis
  (adaptateur Socket.io + état des rooms).
- **Reconnexion par onglet** : la session est gardée dans l'onglet
  (`sessionStorage`). Fermer complètement l'onglet fait perdre sa place.
