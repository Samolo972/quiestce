# Qui a dit ça ?

Jeu web multijoueur en temps réel : chacun écrit une anecdote anonyme, les autres
devinent qui l'a écrite pendant que le texte se dévoile par indices.

Stack : Node.js + Express + Socket.io, front en HTML/CSS/JS vanilla (modules ES,
aucun build). Tout l'état des parties vit en mémoire.

## Lancer en local

```bash
npm install
npm run dev          # http://localhost:3001 (redémarre à chaque modif du serveur)
npm run smoke        # 3 bots jouent une partie complète contre le serveur
```

Pour tester depuis ton téléphone, sur le même Wi-Fi : `http://<IP-du-PC>:3001`.
Pour tester seul avec moins de 3 onglets : `MIN_PLAYERS=2 npm run dev`
(PowerShell : `$env:MIN_PLAYERS=2; npm run dev`).

## Architecture

```
server/
  index.js              HTTP + Socket.io + fichiers statiques
  config.js             constantes globales (port, min/max joueurs…)
  socket.js             événements communs : créer/rejoindre/quitter/réglages/lancer
  rooms/Room.js         état d'une room : joueurs, host, réglages, timers, diffusion
  rooms/roomManager.js  registre des rooms en mémoire (Map code -> Room)
  modes/index.js        registre des modes de jeu
  modes/classic/        mode "Qui a dit ça ?"
    index.js            machine à états : submit -> vote -> reveal -> roundEnd -> craziest -> end
    settings.js         schéma des réglages du lobby + règles fixes
    fragments.js        découpage de l'anecdote en indices
    scoring.js          barème dégressif
public/
  index.html, css/style.css
  js/main.js            choisit l'écran selon l'état reçu
  js/net.js, store.js   socket, horloge serveur, état client
  js/ui.js              échappement HTML, toasts, comptes à rebours
  js/scoreboard.js      scores permanents
  js/screens/*.js       un fichier par écran
deploy/                 exemple nginx + service systemd
```

### Principes

- **Le serveur fait autorité.** À chaque changement, il envoie à chaque joueur
  `room:state`, une vue *filtrée pour lui* (`mode.getView`). L'auteur d'une
  anecdote et les fragments non révélés ne quittent jamais le serveur avant
  leur heure.
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

## Règles implémentées

| Situation | Points |
|---|---|
| Bon vote avec 1 seul indice visible | 3 |
| Bon vote avec 2 ou 3 indices visibles | 2 |
| Bon vote plus tard, ou texte complet | 1 |
| Auteur que personne n'a démasqué (si activé) | +1 |
| Anecdote la plus folle (manche bonus, ex æquo inclus) | +2 |

Le barème se modifie dans `server/modes/classic/scoring.js`. Le nombre d'indices
est calculé pour que le texte soit complet avant la fin du vote
(ex. vote 45 s, un indice toutes les 8 s → 6 indices).

## Déploiement sur le VPS

Le portfolio occupe déjà le port 3000 : ce jeu écoute sur **3001**, uniquement
en local (`HOST=127.0.0.1`), nginx faisant le frontal.

```bash
# Sur le VPS
sudo mkdir -p /var/www/quiaditca && sudo chown debian:debian /var/www/quiaditca
# copier le projet (git clone, ou scp/rsync sans node_modules), puis :
cd /var/www/quiaditca && npm ci --omit=dev

sudo cp deploy/quiaditca.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now quiaditca
curl http://127.0.0.1:3001/health

sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/quiaditca
sudo ln -s /etc/nginx/sites-available/quiaditca /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jeu.samuel-josephmyrtil.fr
```

Le jeu est servi sur **https://jeu.samuel-josephmyrtil.fr** : l'enregistrement DNS
du sous-domaine doit pointer vers le VPS (type A → 15.235.81.225) avant de lancer certbot.

## Limites connues et risques pour la suite

- **Déconnexion = départ définitif.** Sur mobile, verrouiller l'écran ou changer
  d'appli coupe souvent le WebSocket : le joueur est retiré de la partie. C'est
  le point le plus gênant en vrai. La prochaine étape prévue : garder le joueur
  quelques dizaines de secondes après une déconnexion et le rattacher via un
  jeton en `sessionStorage` (le `playerId` est déjà distinct du `socket.id`
  pour ça, et le client se contente d'afficher l'état envoyé : il suffira de
  renvoyer `room:state`).
- **Mémoire uniquement.** Un redémarrage du service (déploiement, crash) coupe
  toutes les parties en cours. Acceptable pour des parties de 15 minutes.
  SQLite n'apporterait pas grand-chose ici : l'état est éphémère et très
  « vivant » (timers). Il deviendrait utile pour des données durables
  (historique, anecdotes favorites, stats).
- **Une seule instance.** Les timers et les rooms vivent dans le process Node.
  Pour plusieurs instances, il faudrait Redis (adaptateur Socket.io + état des
  rooms), et que les timers ne tournent que sur l'instance « propriétaire » de
  la room. Tant qu'une instance suffit (des centaines de parties simultanées),
  inutile.
- **Pas de modération ni de rate limiting** pour l'instant : n'importe qui avec
  le code peut rejoindre le lobby. Les entrées sont validées côté serveur et
  échappées à l'affichage (pas d'injection HTML).
