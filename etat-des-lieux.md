# État des lieux - Lemanus Wave

## MVP 1

| Feature | État | Ajout en cours de route |
| --- | --- | --- |
| Carte du Léman | OK | N |
| Position GPS | OK | N |
| Mode mock local | OK | Y |
| Vitesse | OK | N |
| Ligne indicative des 300 m | OK | N |
| Recentrage GPS | OK | Y |
| Suivi GPS | OK | Y |
| Orientation téléphone | OK | Y |
| UI mobile avec menu bas | OK | Y |
| Réglages | OK | Y |
| Version/commit visible dans Réglages | OK | Y |

## MVP 2

| Feature | État | Ajout en cours de route |
| --- | --- | --- |
| Météo actuelle | OK | N |
| Météo +1h | OK | Y |
| Vent et direction | OK | N |
| Rafales | Supprimé volontairement | N |
| Ports principaux | NOK, pas de dataset dédié | N |
| Recherche de lieux OpenStreetMap autour du Léman | OK | Y |
| Cap approximatif/orientation | OK | N |
| Distance vers port/point | OK à vol d’oiseau | N |
| ETA simple | En cours via mode navigation | N |
| Itinéraire vers destination | OK, indicatif | Y |
| Navigation démarrée | Première version OK | Y |

## Suite

| Sujet | État | Priorité |
| --- | --- | --- |
| Stabiliser l’écran météo final | En cours | Haute |
| Finaliser l’UX du mode navigation | En cours | Haute |
| Tester GPS/suivi/orientation en conditions réelles | À faire | Haute |
| Décider si l’itinéraire reste indicatif ou devient une fonctionnalité plus robuste | À décider | Moyenne |
| Ajouter ports favoris/dataset local si OpenStreetMap ne suffit pas | À décider | Moyenne |
| Garder le modèle static web app sans backend | OK | Continue |

## Notes

- L’itinéraire reste indicatif : ce n’est pas une référence légale ni un routage maritime officiel.
- La météo reste basée sur une source gratuite et simple, sans radar live.
- La recherche dépend d’OpenStreetMap/Nominatim, donc les résultats peuvent être irréguliers.
