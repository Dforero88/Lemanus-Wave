# Lemanus Wave - Requirements

Date: 2026-06-24

## Objectif produit

Lemanus Wave est une application locale pour la navigation moteur et plaisance sur le Lac Leman.

Le produit doit rester simple:

- donner une lecture rapide de la position sur le lac;
- afficher la vitesse;
- aider a comprendre la zone indicative des 300 m;
- ajouter ensuite les informations utiles pour preparer ou suivre une sortie.

## Positionnement

Lemanus Wave ne cherche pas a remplacer Navionics, C-MAP ou Savvy Navvy.

Positionnement retenu:

> Assistant local simple pour naviguer sur le Leman.

## Plateforme cible

### MVP 1

Web app responsive / PWA.

Raison:

- plus rapide a livrer;
- plus simple a tester;
- pas de publication App Store / Play Store;
- suffisant pour valider l'interet du produit.

### Post-MVP

Une application native iOS / Android pourra etre etudiee plus tard si les usages reels montrent un besoin fort pour:

- GPS en arriere-plan;
- navigation longue duree;
- notifications fiables;
- offline robuste;
- experience installee premium.

## Choix techniques de depart

### Carte

Choix recommande:

- `MapLibre`
- `OpenFreeMap`
- donnees cartographiques basees sur `OpenStreetMap`

Raison:

- gratuit pour demarrer;
- rendu moderne;
- compatible web et futur natif;
- possibilite de self-hosting plus tard.

### Donnees locales

Utiliser des fichiers `GeoJSON` versionnes dans le repo pour:

- ligne indicative des 300 m;
- ports principaux a partir du MVP 2;
- points d'interet locaux eventuels.

### Meteo

Pour MVP 2:

- utiliser `Open-Meteo` comme source initiale;
- garder MeteoSwiss Open Data comme option a revisiter quand l'acces API individuel sera suffisamment clair.

## MVP 1 - Navigation live minimale

### Objectif

Valider que l'application est utile pendant une sortie sur le lac.

Question de validation:

> Est-ce qu'un utilisateur sur le Leman ouvre Lemanus Wave pour connaitre rapidement sa position, sa vitesse et son rapport a la zone indicative des 300 m?

### UX / UI cible

MVP 1 doit rester volontairement minimal.

Premier ecran:

- carte plein ecran du Leman;
- position GPS affichee sur la carte;
- ligne indicative des 300 m visible sur la carte;
- petit encart de vitesse;
- aucun menu complexe;
- aucun panneau secondaire;
- aucun contenu explicatif long.

L'interface doit donner une lecture immediate de la situation, sans transformer l'ecran en tableau de bord.

### Fonctionnalites incluses

#### Carte du Leman

L'utilisateur doit voir une carte centree sur le Lac Leman.

Exigences:

- la carte doit s'ouvrir directement sur le Leman;
- la carte doit etre utilisable sur smartphone;
- l'utilisateur doit pouvoir zoomer et se deplacer;
- les attributions cartographiques doivent etre visibles.

#### Position GPS

L'application doit demander automatiquement la position GPS au chargement.

Exigences:

- demander la permission de localisation sans action utilisateur initiale;
- afficher la position actuelle sur la carte;
- mettre a jour la position quand l'utilisateur se deplace;
- permettre de recentrer la carte sur la derniere position GPS connue;
- permettre d'activer / desactiver le suivi continu de la position GPS;
- desactiver le suivi continu si l'utilisateur deplace manuellement la carte;
- ne plus afficher d'indication GPS dediee une fois la position acceptee et active;
- afficher un bouton de secours `Reessayer GPS` uniquement si la permission est refusee ou si la position n'est pas disponible;
- afficher un message clair si la permission est refusee;
- afficher un message clair si la position n'est pas disponible.

#### Vitesse

L'utilisateur doit voir sa vitesse actuelle.

Exigences:

- afficher la vitesse en km/h;
- calculer la vitesse depuis le GPS si la vitesse native n'est pas disponible;
- lisser la valeur pour eviter les sauts visuels trop brusques;
- afficher `--` ou un etat equivalent tant que la vitesse n'est pas fiable.

Option a considerer:

- afficher aussi les noeuds plus tard, mais ne pas le rendre obligatoire dans MVP 1.

#### Ligne indicative des 300 m

L'utilisateur doit voir une ligne indicative representant approximativement la limite des 300 m depuis les rives.

Exigences:

- afficher une ligne visible autour du lac;
- utiliser une geometrie simplifiee suffisante pour un repere visuel;
- ne pas presenter cette ligne comme une reference legale;
- afficher une mention courte: `Limite indicative 300 m`;
- eviter une precision visuelle trompeuse si la ligne est simplifiee.

Texte de disclaimer recommande:

> Ligne indicative non officielle. Ne constitue pas une reference legale.

### Hors scope MVP 1

Ne pas inclure dans MVP 1:

- meteo;
- vent;
- ports;
- cap;
- ETA;
- distance vers un point;
- compte utilisateur;
- historique de navigation;
- carte offline;
- AIS;
- alertes officielles;
- routage nautique.

## MVP 2 - Aide a la sortie

### Objectif

Ajouter les informations utiles avant ou pendant une sortie, sans transformer l'application en systeme nautique complexe.

Question de validation:

> Est-ce que Lemanus Wave aide l'utilisateur a prendre une decision simple avant ou pendant sa sortie?

### Fonctionnalites incluses

#### Meteo actuelle

L'utilisateur doit voir un bloc meteo base sur sa position GPS actuelle.

Exigences:

- afficher temperature;
- afficher conditions principales;
- afficher une icone meteo animee;
- afficher precipitation si disponible;
- afficher heure de derniere mise a jour;
- afficher vent et direction du vent dans le meme bloc;
- afficher une indication visuelle de l'orientation du vent;
- grouper les metriques dans un rendu compact et premium;
- permettre de masquer / afficher le bloc meteo;
- charger la meteo une seule fois quand la premiere position GPS est disponible;
- permettre une actualisation manuelle via un bouton refresh;
- ne pas rafraichir automatiquement la meteo a chaque mouvement GPS;
- preparer la structure pour une prevision `+1h`;
- gerer l'indisponibilite de l'API proprement.

#### Vent

L'utilisateur doit voir le vent dans le bloc meteo.

Exigences:

- afficher vitesse du vent;
- afficher direction du vent;
- afficher une fleche d'orientation du vent;
- afficher unite claire;
- privilegier une presentation simple et lisible.

#### Ports principaux

L'utilisateur doit voir les ports principaux du Leman.

Exigences:

- afficher les ports principaux sur la carte;
- stocker les ports dans un fichier `GeoJSON`;
- afficher au minimum le nom du port;
- afficher la commune si disponible;
- permettre de selectionner un port comme destination.

Donnees initiales minimales:

- nom;
- latitude;
- longitude;
- commune;
- pays / canton / departement si disponible.

#### Orientation telephone

L'utilisateur doit voir l'orientation approximative de son telephone sur la carte, meme a l'arret.

Exigences:

- afficher un marqueur GPS avec une indication d'orientation quand les capteurs sont disponibles;
- utiliser l'orientation du telephone, pas le cap de deplacement GPS;
- fonctionner meme quand l'utilisateur est immobile;
- demander l'autorisation capteur via une action utilisateur si le navigateur l'exige;
- garder un point GPS simple si l'orientation est indisponible ou refusee;
- permettre d'orienter la carte selon l'orientation du telephone via un toggle dedie;
- desactiver l'orientation automatique de la carte si l'utilisateur manipule la carte manuellement;
- en mode mock local, afficher une orientation fixe vers le sud.

#### Distance vers un port ou un point

L'utilisateur doit pouvoir connaitre la distance vers une destination.

Exigences:

- selectionner un port ou un point;
- calculer la distance a vol d'oiseau;
- afficher la distance en kilometres;
- mettre a jour la distance quand la position change.

Hors scope:

- routage nautique reel;
- contournement d'obstacles;
- prise en compte de zones interdites.

#### ETA simple

L'utilisateur doit voir une ETA simple vers une destination.

Exigences:

- utiliser distance restante et vitesse actuelle;
- afficher une ETA seulement si la vitesse est suffisante et stable;
- afficher un etat `ETA indisponible` si le calcul n'est pas fiable;
- ne pas presenter l'ETA comme une prediction nautique avancee.

## Requirements non fonctionnels

### Simplicite

L'application doit rester lisible et rapide a comprendre.

Exigences:

- pas de menu complexe dans MVP 1;
- pas d'inscription;
- pas de configuration obligatoire;
- premier ecran directement utile.

### Mobile first

L'application doit etre concue d'abord pour smartphone.

Exigences:

- UI utilisable a une main;
- chiffres lisibles en exterieur;
- controles assez grands;
- pas de texte dense sur la carte.

### Performance

L'application doit rester fluide sur mobile.

Exigences:

- limiter les couches de carte;
- charger les GeoJSON localement;
- eviter les calculs geospatiaux lourds cote client;
- pre-generer la ligne 300 m.

### Confidentialite

La localisation doit rester sous controle utilisateur.

Exigences:

- demander explicitement la permission GPS;
- ne pas creer de compte dans MVP 1;
- ne pas stocker d'historique de navigation dans MVP 1;
- ne pas envoyer la position a un serveur sauf besoin technique explicite et documente.

### Robustesse

L'application doit gerer les cas courants d'echec.

Exigences:

- GPS refuse;
- GPS indisponible;
- precision GPS faible;
- reseau indisponible;
- carte lente a charger;
- API meteo indisponible en MVP 2.

## Acceptance criteria MVP 1

MVP 1 est acceptable si:

- la carte s'ouvre sur le Leman;
- l'utilisateur peut activer sa position GPS;
- sa position s'affiche sur la carte;
- sa vitesse s'affiche ou un etat non disponible est visible;
- une ligne indicative des 300 m est visible;
- le disclaimer de la ligne 300 m est visible ou accessible;
- l'interface fonctionne sur smartphone;
- aucune fonctionnalite hors scope ne complexifie l'ecran principal.

## Acceptance criteria MVP 2

MVP 2 est acceptable si:

- la meteo actuelle s'affiche;
- le vent et sa direction s'affichent;
- les ports principaux s'affichent sur la carte;
- l'utilisateur peut choisir un port comme destination;
- la distance vers la destination s'affiche;
- l'ETA simple s'affiche quand la vitesse est suffisante;
- l'orientation du telephone s'affiche sur la carte quand les capteurs sont disponibles;
- les etats d'erreur API/GPS sont geres proprement.

## Backlog post-MVP

Fonctionnalites a ne pas prioriser avant validation:

- app native;
- cartes offline;
- alertes officielles de tempete;
- AIS;
- routage nautique;
- profils de bateau;
- consommation carburant;
- partage de position;
- historique de trajets;
- comptes utilisateurs;
- zones reglementaires detaillees;
- bathymetrie;
- notifications push.
