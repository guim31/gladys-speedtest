# Speedtest.net pour Gladys Assistant

Mesurez périodiquement votre connexion internet, directement depuis Gladys, via
le réseau mondial de serveurs Speedtest.net. Chaque test alimente quatre
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
coller dans le champ **ID du serveur**.

## À savoir

- **Un test sature la connexion pendant qu'il tourne.** Les résultats sont
  aussi légèrement conservateurs sur les lignes très rapides, la mesure
  partageant le CPU avec les limites que Gladys impose aux intégrations.
- **Un test transfère de vraies données** — plusieurs centaines de Mo par
  passage sur une ligne rapide. Si votre forfait est plafonné, espacez les
  tests automatiques ou désactivez-les pour ne garder que le bouton manuel.
- Les tests planifiés suivent le réglage **Intervalle entre les tests** (par
  défaut : un test par heure). Le bouton **Lancer un test de débit** fonctionne
  à tout moment.

## Widget de tableau de bord

Avec Gladys 5.1 ou plus récent, l'intégration ajoute un widget **Débit
Internet** à l'éditeur de tableau de bord (**Ajouter un widget →
Speedtest.net**). Il montre :

- quatre tuiles en direct — débit descendant, débit montant, ping et gigue —
  qui suivent les capteurs dès qu'un test les publie ;
- un graphique de l'historique de deux d'entre eux : **Graphique** choisit
  _Débits descendant et montant_ (par défaut) ou _Ping et gigue_, **Fenêtre
  d'historique** les dernières 24 heures, la dernière semaine (par défaut) ou
  le dernier mois ;
- la date du dernier test et le serveur Speedtest.net utilisé (opérateur et
  ville), et _Test en cours_ pendant qu'un test tourne ;
- un bouton **Lancer un test**. Le résultat s'affiche en notification à la fin
  du test (environ une demi-minute). Appuyer pendant qu'un test tourne déjà
  n'en lance pas un second.

À savoir :

- Les tuiles et le graphique lisent les capteurs de l'appareil : ajoutez-le à
  Gladys (**Intégrations → Speedtest.net → Découverte**) pour qu'ils se
  remplissent.
- La date et le serveur du dernier test sont conservés par l'intégration :
  juste après une mise à jour ou un redémarrage, avant tout test, le widget le
  dit, tandis que les tuiles gardent les dernières valeurs enregistrées par
  Gladys.
- Les fenêtres du graphique et l'historique long suivent vos réglages Gladys
  de conservation des données des appareils.

## Dépannage

- _Résultats plus bas que l'application officielle_ : augmentez **Connexions
  parallèles** (les lignes rapides se remplissent mieux à 6–8) ou la **Durée de
  mesure**.
- _Test en échec_ : le serveur le plus proche est peut-être en panne — imposez
  un autre **ID de serveur**, ou videz le champ pour laisser la sélection
  automatique écarter les serveurs défaillants.

Cette intégration est un projet communautaire indépendant, sans affiliation ni
approbation d'Ookla. Speedtest® est une marque d'Ookla, LLC.
