# État des lieux - Lemanus Wave

## MVP 1

Le MVP 1 est globalement OK et dépassé.

- Carte du Léman : OK.
- Position GPS : OK, avec demande automatique au chargement.
- Mode mock local : OK, point fixe sur le Léman.
- Vitesse : OK, avec garde-fous et calcul seulement quand utile.
- Ligne indicative des 300 m : OK, basée sur GeoJSON.
- Recentrage GPS : ajouté.
- Suivi GPS : ajouté.
- Orientation téléphone : ajouté.
- UI mobile avec menu bas : ajouté.
- Réglages : ajouté.
- Version/commit visible dans Réglages : ajouté.

## MVP 2

Le MVP 2 est partiellement réalisé, avec plusieurs ajouts au-delà du scope initial.

- Météo actuelle : OK.
- Météo +1h : OK, affichée directement avec la météo actuelle.
- Vent et direction : OK.
- Rafales : supprimé volontairement.
- Ports principaux : pas implémenté comme dataset dédié.
- Recherche de lieux OpenStreetMap autour du Léman : ajoutée, couvre en partie le besoin ports/lieux.
- Cap approximatif/orientation : OK via orientation téléphone.
- Distance vers port/point : OK à vol d’oiseau dans les résultats de recherche.
- ETA simple : commencé via mode navigation.
- Itinéraire vers destination : ajouté, indicatif, avec calcul sur grille virtuelle.
- Navigation démarrée : ajoutée en première version avec distance restante, vitesse, temps et ETA.

## Ajouts faits en cours de route

- Déploiement production Infomaniak via GitHub Actions.
- Build statique compatible Apache/PHP, sans runtime Node.js en production.
- Icônes météo animées Meteocons.
- Icônes Lucide pour cohérence UI.
- Wake Lock expérimental dans les réglages, avec limite iOS.
- Recherche de lieux via OpenStreetMap/Nominatim.
- Fiche lieu sélectionné.
- Bouton Itinéraire.
- Calcul de trajet indicatif en bateau, sans routage routier.
- Mode navigation avec bouton Démarrer/Quitter.
- Masquage des cartes flottantes en navigation.
- Distance au bord du lac.
- Améliorations GPS après retour d’app/veille.
- Suppression de la pluie en mm, car la donnée était peu fiable et peu intuitive.

## Points encore fragiles ou à stabiliser

- Itinéraire : fonctionnel mais indicatif, pas légal et pas un routage maritime officiel.
- Orientation/suivi GPS : beaucoup mieux, mais à continuer de tester en conditions réelles sur iPhone.
- Météo : gratuite et simple, mais pas radar live.
- Recherche OSM : dépend de Nominatim, donc les résultats peuvent être irréguliers.
- Navigation active : première version, à valider sur lac/voiture/téléphone.

## Suite logique

1. Stabiliser l’écran météo final.
2. Finaliser l’UX du mode navigation.
3. Tester GPS/suivi/orientation en conditions réelles.
4. Décider si l’itinéraire reste une aide indicative simple ou devient une vraie fonctionnalité plus robuste.
5. Ajouter ports favoris/dataset local seulement si OpenStreetMap ne suffit pas.
