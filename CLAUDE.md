# CLAUDE.md — Speedtest.net

Mesurez périodiquement le débit de votre connexion via les serveurs Speedtest.net.

Intégration externe pour [Gladys Assistant](https://gladysassistant.com), bâtie sur le template officiel `GladysAssistant/integration-template-js` (SDK `@gladysassistant/integration-sdk` ^0.14.0, `gladys_version` `>=5.1.0`). Mainteneur : Guilhem (`guim31`).

Ce fichier rassemble ce qu'une session de code doit savoir et qui ne se lit pas dans le code : choix de conception, faits vérifiés en réel, pièges déjà payés. Le compléter quand un nouveau piège est découvert.

## État au 05/10/2026

Version 1.0.2 publiée, indexée dans le store. Un appareil virtuel et quatre capteurs historisés :
débit descendant et montant (Mbit/s), ping et gigue (ms). Moteur en JavaScript pur, validé en réel
sur une fibre gigabit (environ 920 et 850 Mbit/s), pour une mémoire résidente d'environ 178 Mo
dans une sandbox Gladys de 256 Mo : surveiller la mémoire à chaque changement du moteur.

Branche `feat/dashboard-widgets` (PR brouillon, non publiée) : SDK 0.14, `gladys_version`
`>=5.1.0` et un widget de tableau de bord `speed` (« Débit Internet »), **jamais vu tourner dans
une vraie Gladys** : seuls les tests, le lint et le validateur du store sont passés. À vérifier en
réel : le rendu des tuiles liées avant que l'appareil soit ajouté, la fenêtre de l'historique, le
toast du bouton, et `/data/last-result.json` relu après redémarrage.

## Widget `speed` : choix de conception

- Les quatre tuiles et le graphique sont **liés aux fonctionnalités** (`device_feature`,
  `device_features`) : ils vivent sans travail et le contenu ne coûte aucun appel réseau. Le
  contenu ne porte que ce que le cœur ne sait pas : la date du dernier test et le serveur Ookla.
- Le dernier résultat est persisté dans `/data/last-result.json` (`src/store.js`, écriture
  atomique, meilleur effort) et relu au démarrage, pour renseigner le widget après un redémarrage.
  En local, `SPEEDTEST_DATA_DIR` pointe le store ailleurs ; les tests utilisent un dossier
  temporaire via `setStoreForTests`.
- `requestWidgetRefresh('speed')` est appelé **au début et à la fin** de chaque test (le brief ne
  demandait que la fin) : le widget passe à « Test en cours » (`ttl_seconds` 10) puis au résultat
  (`ttl_seconds` 300). Un test dure au moins 20 s, donc les deux appels tiennent sous la limite du
  cœur (1 par 10 s) ; un moteur qui échoue en moins de 10 s perd la seconde demande, et c'est le
  ttl de 10 s qui rattrape.
- Le bouton reste affiché pendant un test, avec l'icône `loader` au lieu de `play` (jamais le
  style `primary`) ; l'action répond alors par un toast poli sans relancer de test
  (`currentRun` partagé avec le bouton de configuration et le planificateur).
- L'action du widget **attend la fin du test** et renvoie le résultat en toast
  (`action_timeout_seconds` 120 : 2 × 20 s + 10 s + sélection du serveur).
- État vide (pas de résultat en mémoire, pas de test en cours) : un `text` body, mais les tuiles,
  le graphique et le bouton restent, car Gladys garde l'historique même quand le conteneur l'a
  oublié (premier démarrage après la mise à jour depuis 1.0.2).
- « Dernier test » : « à l'instant » / « il y a n min » sous une heure, sinon date courte
  localisée par `Intl.DateTimeFormat` (fuseau : `TZ` injecté par le superviseur). « Serveur » :
  `sponsor · name` (opérateur · ville) coupé à 40 caractères.
- Clés figées : widget `speed`, action `run_test`, réglages `chart` (`speeds`, `latency`) et
  `interval` (`last-day`, `last-week`, `last-month`).

## Pièges du protocole OoklaServer

- Un POST sans `User-Agent` reçoit un 500 immédiat. Comme la réponse arrive avant l'envoi du
  corps, on mesure alors l'écriture dans un socket mort : 4200 Mbit/s « mesurés » sur une ligne
  gigabit.
- L'upload exige des morceaux d'1 Mo et un agent keep-alive : à 64 Ko par écriture, c'est la
  boucle d'événements qu'on mesure, plafonnée vers 110 Mbit/s.
- Le catalogue `www.speedtest.net/api/js/servers` liste des serveurs morts : l'auto-sélection
  sonde cinq candidats.
- Ne pas juger le moteur sur une mesure faite depuis une session cloud : tout son trafic sortant
  passe par un proxy.

## Travailler sur ce dépôt

- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run format:check`, `npm run lint`,
  `npm test` (`node --test`). Prettier contrôle **aussi le Markdown** : lancer `npm run format`
  après avoir modifié ce fichier ou le README, sinon la CI tombe.
- La CI tourne en Node 24. Une session cloud a Node 22 par défaut, ce qui suffit (`engines` :
  `>=20`).
- Une session de code n'a **ni instance Gladys ni appareil réel**. La suite de tests, le lint et
  le validateur du store sont les seules vérifications possibles : le test réel passe par
  Guilhem ou par les testeurs du forum. Le dire, plutôt que de conclure que « ça marche ».
- **Publier est un geste de Guilhem** : Actions → Release (patch, minor ou major) construit
  l'image `ghcr.io/guim31/<dépôt>`, monte la version du manifeste et pose le tag. Un correctif
  poussé sur `main` sans Release n'atteint aucune installation : le signaler.
- Le workflow Release réindente le manifeste sans relancer la CI : passer `npm run format` au
  commit suivant.
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests, ni dans les captures.

## Pièges du cœur Gladys (communs aux intégrations de guim31)

Vérifiés dans le code du cœur ou payés sur une intégration publiée. Ils valent pour toutes.

**Appareils et fonctionnalités**

- **Polling** : le planificateur n'interroge un appareil que si `should_poll: true` **et**
  `poll_frequency` vaut une valeur de la liste fixe (1000, 2000, 10000, 15000, 30000, 60000 ms).
  Publier seulement `poll_frequency` donne un appareil accepté mais jamais interrogé. Pour une
  cadence hors liste, publier `should_poll: false` et pousser les états depuis le conteneur, en
  gardant un `onPoll` de repli.
- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/text` : sans eux,
  « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/0, comme Zigbee2MQTT.
- `level-sensor/decimal` n'existe pas côté serveur. `light-sensor/binary` n'a pas de libellé dans
  le front (pastille vide) : préférer `input/binary`. Un `text/text` reçoit `{ text }`, jamais
  vide, sinon l'état est ignoré.
- Les **noms de fonctionnalités sont figés à la création**. Et quand une fonctionnalité est seule
  de son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place
  du nom publié (`getDeviceFeatureName` du front).
- Depuis Gladys 4.84, un changement de structure fait proposer « Mettre à jour » dans l'onglet
  Découverte (`structure_changed`) : plus besoin de supprimer et recréer l'appareil. Un
  changement des seules `supported_options` ne le déclenche pas.
- **Jauge** : l'aiguille se place par `(value - min) / (max - min)` des bornes de la
  fonctionnalité. `gauge_min`/`gauge_max` ne pilotent que les couleurs, et le cœur n'applique
  jamais `min`/`max` en écriture : ce sont des bornes d'affichage. Une valeur signée exige des
  bornes symétriques.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur, une action de scène non
  plus (un widget, si) : prévoir un champ de config `language`. Le superviseur injecte `TZ`, le
  fuseau de Gladys, dans le conteneur. La sandbox est limitée à 256 Mo.

**Formulaires de configuration et actions**

- Les champs `number` sont rendus en `<input type="number" min max>` **sans `step`** (le
  manifeste n'en accepte pas) : le navigateur n'accepte alors que `min + k`. Min et défaut
  **entiers** seulement ; une valeur décimale passe par un `select` ou par un `string` parsé
  (virgule acceptée).
- Un champ `secret` dans les `fields` d'une **action** est impossible à remplir (la saisie
  s'efface à chaque frappe), et une action n'applique **aucun `default`**, ni à l'affichage ni
  côté serveur, tout en exigeant les champs `required` (422).

**Widgets, déclencheurs, actions de scène (SDK ≥ 0.14, Gladys ≥ 5.1)**

- Budget du cœur : **8 composants par widget, dont 2 textes au plus**. Le validateur du SDK le
  signale ; `validateWidgetContent` est exporté pour les tests.
- Le cœur **jette un bouton dont la clé d'action est déjà prise** : clés numérotées, ce que fait
  le bouton dans ses paramètres.
- Le vocabulaire des widgets n'a ni liste ni curseur. Seul un bouton `device_feature` numérique
  a un état actif natif.
- Dans une grille `card-list`, la `date` s'affiche **à la place** du sous-titre.
- `onWidgetAction` fait recharger le widget dès la résolution, alors que `requestWidgetRefresh`
  est plafonné à un appel toutes les 10 s.
- Les filtres de scène ne font qu'égalité et appartenance : un seuil (Kp > 6) reste le travail
  d'un capteur.
- **Les clés de widgets, de déclencheurs et d'actions sont figées une fois publiées.**
- Passer `gladys_version` à `>=5.1.0` coupe les mises à jour des cœurs plus anciens, qui
  refusent les champs inconnus du manifeste.
- Le passage du SDK 0.13 à 0.14 n'a rien cassé ici : la suite existante passe telle quelle.
- Une ligne de `status` exige un `value` (nombre ou texte ≤ 40) : un état seul se met dans le
  `value`, avec un libellé générique (« État »), pas l'inverse.
- `validateWidgetContent` ne vérifie pas que les `external_id` liés existent : le test croise le
  contenu avec `buildDevice` pour s'en assurer.
- Le validateur du store exige Node ≥ 24 dans son `engines`, mais tourne sous Node 22 avec un
  simple avertissement.

## Publication et store

- Avant de demander une Release ou le topic, lancer le validateur officiel depuis la racine :
  `npx -y github:GladysAssistant/integration-store`. Il vérifie le schéma, la `description`
  (**100 caractères au plus par langue**), la documentation (300 caractères au moins), l'image
  Docker et la cover (**150 Ko au plus**).
- Le topic `gladys-assistant-integration` fait indexer le dépôt ; Guilhem le pose (le jeton de
  l'agent n'en a pas le droit). L'indexeur passe à H:13 chaque heure, souvent avec une demi-heure
  de retard, et rejette **en silence** : la raison n'apparaît que dans `rejected.json`, à côté de
  l'index `https://integration-store-storage.gladysassistant.com/index.json`.
- Sans topic, on installe par la carte « Installer depuis GitHub » (URL du dépôt, Gladys ≥ 4.84) :
  le cœur lit le manifeste sur `main` et propose les mises à jour à chaque rafraîchissement du
  catalogue.
- La règle `data/` du `.gitignore` du template (pour le volume `/data`) exclut aussi `src/data/` :
  l'ancrer en `/data/`, dans `.prettierignore` aussi. Avant de pousser un dépôt neuf, tester sur
  un `git clone` propre, pas sur la copie de travail.
