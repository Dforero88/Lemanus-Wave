# Lemanus Wave - Etude preliminaire

Date: 2026-06-24

## Objectif

Evaluer rapidement la faisabilite et le positionnement d'une application de navigation pour le Lac Leman, principalement orientee navigation moteur et plaisance.

L'approche recommandee reste LEAN-first:

- ne pas essayer de remplacer les grandes applications nautiques mondiales;
- valider d'abord un besoin local fort;
- demarrer avec une solution simple, utile et maintenable;
- enrichir seulement si les usages reels le justifient.

Les exigences fonctionnelles et le decoupage MVP sont documentes dans `requirements.md`.

## 1. Marche et applications existantes

Il existe deja des applications de navigation nautique generales qui peuvent couvrir le Leman ou etre utilisees sur le lac.

### Applications identifiees

#### C-MAP App

C-MAP propose cartes nautiques, routes, waypoints, meteo marine, GPS, AIS, autorouting, mesure de distance et cartes offline en version premium.

Source: https://www.c-map.com/app/

#### Savvy Navvy

Savvy Navvy propose cartes, suivi GPS actif, COG/SOG, meteo, vagues, AIS, smart routing, ETA, consommation carburant et partage de position.

Source: https://www.savvy-navvy.com/

#### Garmin / Navionics

Navionics est un acteur historique des cartes nautiques et lacustres, avec application mobile et web app.

Sources:

- https://en.wikipedia.org/wiki/Navionics
- https://webapp.navionics.com/

#### Applications locales du Leman

Les applications ou services locaux visibles sont surtout lies au transport public, aux croisieres ou aux compagnies lacustres:

- CGN;
- Mouettes genevoises;
- compagnies de bateaux touristiques.

Je n'ai pas identifie d'application clairement dediee a la navigation moteur/plaisance privee sur le Leman avec une logique locale simple.

### Conclusion marche

Le marche est deja occupe par des applications nautiques generales puissantes. En revanche, il semble exister une opportunite pour une application locale, plus simple, centree sur le Leman:

- position GPS live;
- vitesse;
- ligne indicative des 300 m;
- meteo utile sur le lac;
- vent et rafales;
- ports proches;
- distance et ETA;
- reperes de securite.

Positionnement recommande:

> Lemanus Wave ne doit pas etre une alternative complete a Navionics ou C-MAP. Elle doit etre un assistant local de navigation moteur sur le Leman.

## 2. Donnees et APIs possibles

### Meteo, vent et rafales

#### MeteoSwiss Open Data

Depuis mai 2025, MeteoSwiss rend progressivement ses donnees accessibles comme Open Government Data.

Donnees utiles:

- mesures de stations automatiques;
- temperature;
- precipitation;
- vent;
- humidite;
- pression;
- mises a jour frequentes;
- previsions ICON-CH1 / ICON-CH2 avec vent, pression, precipitation, humidite et autres variables.

Point important: MeteoSwiss indique que l'acces par requetes API individuelles n'est pas disponible avant le deuxieme trimestre 2026.

Source: https://www.meteoswiss.admin.ch/services-and-publications/service/open-data.html

#### Open-Meteo

Open-Meteo est une bonne option pour un MVP, car l'API est simple, gratuite pour commencer, et expose directement:

- meteo actuelle;
- previsions horaires;
- vent a 10 m;
- direction du vent;
- rafales;
- precipitation;
- visibilite;
- modeles MeteoSwiss ICON CH1 / CH2.

Source: https://open-meteo.com/en/docs

#### Meteomatics

Meteomatics est une API meteo commerciale suisse. Elle peut devenir interessante si Lemanus Wave a besoin d'une meilleure garantie de service, d'un support professionnel ou de donnees plus specifiques.

Source: https://en.wikipedia.org/wiki/Meteomatics

### Alertes

#### Alertswiss

Alertswiss centralise alertes, warnings, informations et fins d'alerte pour la Suisse.

Source: https://www.alert.swiss/en/home.html

#### Natural Hazards Portal

Le portail suisse des dangers naturels publie la situation officielle sur les dangers naturels.

Source: https://www.natural-hazards.ch/

#### Avis de vent et tempete sur le Leman

Le Leman dispose d'un systeme de phares d'avertissement des coups de vent, avec zones d'alerte autour du lac:

- Haut Lac;
- Grand Lac;
- Petit Lac.

Logique usuelle:

- 40 eclats par minute: avis de fort vent;
- 90 eclats par minute: avis de tempete.

Source: https://fr.wikipedia.org/wiki/L%C3%A9man

Point a verifier: je n'ai pas encore identifie d'API officielle simple permettant de recuperer directement l'etat des feux d'avis de tempete du Leman.

Pour une version future, on peut calculer un niveau d'alerte indicatif a partir des previsions de rafales, mais il faudra l'afficher comme indicatif et non comme alerte officielle.

### Ports, POI et donnees locales

Le Leman comporte plus d'une centaine de ports. Une base initiale peut etre constituee depuis des sources ouvertes, puis verifiee manuellement.

Source: https://fr.wikipedia.org/wiki/Liste_des_ports_du_L%C3%A9man

Donnees utiles a structurer:

- nom du port;
- commune;
- pays / canton / departement;
- position GPS;
- type de port;
- services;
- telephone;
- carburant si disponible;
- places visiteurs si disponible;
- remarques locales.

### AIS

AIS peut etre utile pour afficher les gros bateaux ou le trafic visible, mais ce n'est pas indispensable au MVP.

L'acces fiable passe souvent par des fournisseurs commerciaux. Pour une premiere version, il vaut mieux ne pas rendre l'AIS central.

## 3. GPS smartphone via web app

Une web app peut utiliser le GPS d'un smartphone via la Geolocation API.

Fonctions possibles:

- determiner la position actuelle;
- suivre la position en continu;
- afficher la position sur une carte;
- calculer la distance entre deux points GPS;
- calculer la vitesse;
- calculer un cap approximatif;
- calculer un ETA simple vers un port ou un waypoint.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/speed

### Points techniques

La Geolocation API donne acces a:

- latitude;
- longitude;
- precision;
- altitude parfois;
- vitesse parfois;
- cap parfois.

La vitesse native peut etre `null`. Il faut donc prevoir un calcul interne:

- stocker la position precedente;
- calculer la distance entre les deux points;
- diviser par le temps ecoule;
- lisser la valeur pour eviter les sauts GPS.

### Contraintes web

- HTTPS obligatoire.
- Permission utilisateur obligatoire.
- Precision variable selon telephone, reception GPS, meteo, economie d'energie et navigateur.
- Le suivi en arriere-plan est limite, surtout sur iOS.
- Une web app n'est pas ideale pour une vraie navigation continue longue duree si l'ecran est verrouille.

## 4. Web app vs application native iOS / Android

### Web app

Avantages:

- plus simple a construire;
- plus rapide a tester;
- accessible par URL;
- pas besoin de validation App Store / Play Store;
- cout initial plus bas;
- bon choix pour valider le besoin;
- compatible avec une approche PWA;
- plus facile a maintenir au depart.

Limites:

- GPS en arriere-plan limite;
- notifications push plus contraintes, surtout sur iOS;
- gestion offline plus fragile;
- acces limite aux capteurs et fonctions natives;
- experience moins robuste si l'utilisateur verrouille l'ecran;
- perception parfois moins premium qu'une app installee.

### Application native iOS / Android

Avantages:

- meilleur suivi GPS en navigation continue;
- meilleure gestion de l'arriere-plan;
- notifications push plus fiables;
- meilleure integration avec capteurs, batterie, permissions et mode offline;
- experience plus credible pour un usage nautique regulier;
- possibilite de stocker des cartes offline de maniere plus propre;
- meilleure base pour une logique securite / alerte.

Limites:

- cout de developpement plus eleve;
- deux plateformes a maintenir ou usage d'un framework cross-platform;
- publication App Store / Play Store;
- mises a jour plus lourdes;
- complexite plus forte des permissions;
- besoin de QA plus important.

### Recommandation

Demarrer par une web app / PWA.

Passer en app native uniquement si les usages reels montrent que les besoins suivants deviennent centraux:

- navigation continue longue duree;
- GPS fiable en arriere-plan;
- notifications push critiques;
- cartes offline robustes;
- experience premium installee.

## 5. Carte gratuite

### Option recommandee pour MVP

Utiliser OpenStreetMap comme source de donnees cartographiques.

Attention: OpenStreetMap est libre comme base de donnees, mais les serveurs de tuiles officiels `tile.openstreetmap.org` ne sont pas une infrastructure gratuite illimitee pour une application en production.

La politique officielle indique notamment:

- attribution obligatoire;
- cache local a respecter;
- pas de telechargement massif;
- pas d'offline sur les tuiles officielles;
- pas de garantie de service;
- blocage possible si usage trop lourd.

Source: https://operations.osmfoundation.org/policies/tiles/

### Option simple: Leaflet + tuiles OSM

Leaflet est une librairie JavaScript open-source, legere et mobile-friendly.

Source: https://leafletjs.com/

Usage recommande:

- tres bon pour prototype;
- tres bon pour MVP faible trafic;
- facile a integrer;
- permet GeoJSON, marqueurs, polylines, polygons.

Limite:

- les tuiles OSM officielles ne doivent pas etre considerees comme une solution gratuite illimitee en production.

### Option plus robuste gratuite: OpenFreeMap + MapLibre

OpenFreeMap permet d'afficher des cartes basees sur OpenStreetMap gratuitement, sans API key, avec une instance publique ou en self-hosting. L'usage commercial est annonce comme autorise, sans SLA.

Sources:

- https://openfreemap.org/
- https://maplibre.org/

Avantages:

- gratuit;
- vector tiles;
- rendu moderne;
- compatible web et natif;
- possibilite de self-host plus tard.

Limites:

- pas de SLA;
- dependance a un service gratuit finance par dons;
- a valider avant usage production critique.

### Recommandation carte

Pour Lemanus Wave:

> MapLibre + OpenFreeMap pour une app moderne gratuite, avec possibilite de migrer vers self-hosting si le produit prend.

## 6. Ligne des 300 m depuis les rives

Oui, il est techniquement possible d'ajouter une ligne tout le long du lac pour indiquer la limite des 300 m depuis le bord.

### Principe

Il faut generer une geometrie representant une ligne a 300 m a l'interieur du polygone du lac.

Approche:

1. Recuperer le polygone du Lac Leman.
2. Nettoyer la geometrie.
3. Generer un buffer interieur de 300 m depuis la rive.
4. Extraire la ligne de contour correspondante.
5. L'afficher sur la carte comme couche GeoJSON.

### Variante MVP 1

Pour MVP 1, la ligne n'a pas besoin d'etre juridiquement precise ni de suivre parfaitement chaque bord, port, digue ou embouchure.

Elle doit servir de repere visuel simple:

- ligne indicative;
- non officielle;
- non opposable legalement;
- suffisamment lisible pour comprendre l'ordre de grandeur.

### Sources possibles pour le contour du lac

Options:

- OpenStreetMap / Overpass API;
- donnees geo.admin.ch / swisstopo si une couche adaptee est disponible;
- Natural Earth pour un contour grossier, mais pas assez precis pour 300 m;
- fichier GeoJSON nettoye manuellement pour le MVP.

### Recommandation technique

Pour le MVP, le plus simple est:

- recuperer ou dessiner un contour simplifie du lac;
- generer une ligne 300 m une fois;
- sauvegarder le resultat dans un fichier `geojson`;
- charger ce fichier dans l'app;
- ne pas recalculer la ligne cote client.

Librairies possibles:

- Turf.js pour les operations geospatiales simples;
- QGIS pour verifier visuellement;
- PostGIS si le projet devient plus serieux;
- Mapshaper pour nettoyer et simplifier les geometries.

### Limites importantes

La ligne des 300 m doit etre affichee comme aide visuelle, pas comme reference legale officielle, tant que la geometrie n'est pas validee.

Points a verifier plus tard:

- definition exacte du "bord" juridiquement applicable;
- ports, digues, embouchures, zones speciales;
- differences potentielles entre rive suisse et rive francaise;
- precision du polygone source;
- simplification de la geometrie pour mobile;
- lisibilite sur petit ecran.

## 7. Decision recommandee

Demarrer avec une web app / PWA simple.

Choix proposes:

- Nom produit: `Lemanus Wave`
- Carte: `MapLibre + OpenFreeMap`
- Donnees meteo: `Open-Meteo` a partir du MVP 2
- Donnees locales: fichiers `GeoJSON` versionnes dans le repo
- Ligne 300 m: generee une fois et affichee comme couche indicative
- App native: a reporter apres validation du besoin

La premiere version doit prouver une chose:

> Est-ce qu'un utilisateur sur le Leman ouvre Lemanus Wave parce qu'elle lui donne rapidement une lecture utile de sa position, de sa vitesse et de la zone indicative des 300 m?

