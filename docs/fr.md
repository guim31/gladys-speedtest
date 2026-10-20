# Speedtest.net & Cloudflare pour Gladys Assistant

Mesurez périodiquement votre connexion internet, directement depuis Gladys, via
le réseau mondial de serveurs Speedtest.net ou le test de débit de Cloudflare.
Chaque test alimente quatre
capteurs à afficher en graphique sur le tableau de bord et à exploiter dans les
scènes :

| Capteur      | Unité  | Ce qu'il indique                                        |
| ------------ | ------ | ------------------------------------------------------- |
| **Download** | Mbit/s | La vitesse à laquelle les données arrivent chez vous    |
| **Upload**   | Mbit/s | La vitesse à laquelle les données partent de chez vous  |
| **Ping**     | ms     | Le temps de réaction de la connexion (plus bas = mieux) |
| **Jitter**   | ms     | La stabilité de ce temps de réaction (plus bas = mieux) |

Usages typiques : vérifier ce que votre FAI délivre réellement, être averti par
une scène quand le débit descend sous ce que vous payez, ou détecter qu'un lien
de secours (bascule 4G…) a pris le relais.

## Déroulement d'un test

L'intégration parle directement à l'infrastructure Speedtest.net — pas de
compte, pas de clé d'API, aucun logiciel Ookla installé. Par défaut, elle sonde
les serveurs les plus proches, garde le plus sain, puis mesure latence, débit
descendant et débit montant (environ 25 secondes au total). Vous pouvez aussi
imposer un serveur : le bouton **Lister les serveurs proches** donne les ID, à
coller dans le champ **ID du serveur Speedtest.net**.

## Choisir le moteur

Le champ **Moteur de test** choisit contre qui vous mesurez. Les deux moteurs
alimentent les mêmes quatre capteurs, avec la même planification, les mêmes
connexions parallèles et la même durée de mesure : changer de moteur garde
l'appareil, son historique et vos scènes.

- **Speedtest.net** (par défaut) : un serveur proche du réseau Speedtest.net,
  choisi automatiquement ou imposé par son ID.
- **Cloudflare** : le point de présence le plus proche du réseau Cloudflare,
  celui de [speed.cloudflare.com](https://speed.cloudflare.com/). Pas de
  serveur à choisir, pas de compte. Le widget l'affiche sous la forme
  _Cloudflare_ suivi du code d'aéroport de sa ville (_CDG_ pour Paris, _MRS_
  pour Marseille…).

Le moteur Cloudflare peut aussi afficher **votre adresse IP publique**, telle
que Cloudflare la voit : activez **Afficher mon IP publique (Cloudflare)**. Elle
apparaît alors dans le widget et dans le résultat du test manuel, et elle est
conservée avec le dernier résultat dans le stockage de l'intégration. Elle n'est
jamais écrite dans les journaux. Désactivé par défaut.

Cloudflare mesure la latence sur une requête vide, moins le temps de traitement
annoncé par son serveur, et garde le meilleur de 20 essais ; la gigue est
l'écart moyen entre essais successifs, comme pour Speedtest.net. Les chiffres
des deux moteurs sont proches sans être identiques : comparez une ligne avec
elle-même, sur un même moteur.

## À savoir

- **Un test sature la connexion pendant qu'il tourne.** Les résultats sont
  aussi légèrement conservateurs sur les lignes très rapides, la mesure
  partageant le CPU avec les limites que Gladys impose aux intégrations.
- **Un test transfère de vraies données** — plusieurs centaines de Mo par
  passage sur une ligne rapide, quel que soit le moteur (sur une fibre
  gigabit, jusqu'à environ 1,5 Go par sens avec les réglages par défaut). Si
  votre forfait est plafonné, espacez les tests automatiques ou désactivez-les
  pour ne garder que le bouton manuel.
- **Cloudflare limite les gros usages.** Après beaucoup de trafic en peu de
  temps (deux tests gigabit à quelques minutes d'intervalle, lors de nos
  essais), il refuse un moment les gros téléchargements avec une erreur
  HTTP 429 : le test échoue alors avec un message qui le dit, et le test
  planifié suivant réessaie. Un test automatique ne peut jamais partir plus
  souvent que toutes les 10 minutes.
- Les tests planifiés suivent le réglage **Intervalle entre les tests** (par
  défaut : un test par heure). Le bouton **Lancer un test de débit** fonctionne
  à tout moment.

## Widget de tableau de bord

Avec Gladys 5.1 ou plus récent, l'intégration ajoute un widget **Débit
Internet** à l'éditeur de tableau de bord (**Ajouter un widget →
Speedtest.net & Cloudflare**). Il montre :

- deux tuiles côte à côte, débit descendant et débit montant : en Mb/s
  entiers, ou en Gb/s avec une décimale au-delà de 1 000 Mb/s (1,2 Gb/s) ;
- un graphique en aires de l'historique de deux capteurs : **Graphique** choisit
  _Débits descendant et montant_ (par défaut) ou _Ping et gigue_, **Fenêtre
  d'historique** les dernières 24 heures, la dernière semaine (par défaut) ou
  le dernier mois ;
- le ping et la gigue du dernier test, sa date et le serveur utilisé
  (Speedtest.net : opérateur et ville ; Cloudflare : _Cloudflare · CDG_),
  votre IP publique si vous l'avez demandée, et _Test en cours_ pendant qu'un
  test tourne ;
- un bouton **Lancer un test**. Le résultat s'affiche en notification à la fin
  du test (environ une demi-minute). Appuyer pendant qu'un test tourne déjà
  n'en lance pas un second.

**Affichage** allège le widget : _Complet_ (par défaut) est la présentation ci-dessus ; _Débits, ping et graphique_ garde trois cases (débit descendant, montant, ping) et le graphique ; _Débits et ping_ garde les trois cases seules. Ces deux versions n'ont ni lignes d'état ni bouton : un test se lance toujours depuis la configuration de l'intégration.

À savoir :

- Le graphique lit les capteurs de l'appareil : ajoutez-le à Gladys
  (**Intégrations → Speedtest.net & Cloudflare → Découverte**) pour qu'il se remplisse.
- Le widget n'arrondit que ce qu'il affiche : Gladys garde les valeurs
  mesurées, décimales comprises, dans les capteurs et leur historique.
- Le dernier résultat est conservé par l'intégration d'un redémarrage à
  l'autre. Avant le premier test, les tuiles affichent un tiret et le widget
  indique qu'aucun résultat n'est encore connu.
- Les fenêtres du graphique et l'historique long suivent vos réglages Gladys
  de conservation des données des appareils.

## Dépannage

- _Résultats plus bas que l'application officielle_ : augmentez **Connexions
  parallèles** (les lignes rapides se remplissent mieux à 6–8) ou la **Durée de
  mesure**.
- _Test en échec_ : le serveur le plus proche est peut-être en panne — imposez
  un autre **ID du serveur Speedtest.net**, ou videz le champ pour laisser la sélection
  automatique écarter les serveurs défaillants. Avec le moteur Cloudflare, une
  erreur _HTTP 429_ signifie que Cloudflare limite votre adresse pour un
  moment : espacez les tests, ou réduisez la durée de mesure.
- _L'ID du serveur ne change rien_ : il ne sert qu'au moteur Speedtest.net.
- _Journaux_ : au niveau par défaut, l'intégration note son démarrage, vos
  tests manuels et le premier échec du test automatique (puis une ligne quand
  il refonctionne). Pour voir chaque test, son serveur et son résultat,
  donnez la variable d'environnement `LOG_LEVEL=debug` au conteneur.

Cette intégration est un projet communautaire indépendant, sans affiliation ni
approbation d'Ookla ni de Cloudflare. Speedtest® est une marque d'Ookla, LLC ;
Cloudflare® est une marque de Cloudflare, Inc.
