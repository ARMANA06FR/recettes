# Mes Recettes — PWA

Application web progressive (PWA) pour enregistrer, classer et retrouver vos recettes, générer des menus de la semaine et la liste de courses.

## Fonctionnalités

- **Recettes** : créer, modifier, supprimer (titre, catégorie, temps, portions, source, ingrédients, étapes, notes, photo)
- **Photos** : depuis la galerie ou l’appareil photo (compressées automatiquement)
- **Catégories** : Entrée, Plat, Dessert, Légumes, Fruits, Viandes, Poisson, Sauce, Base/Pâte, Boisson, Autre
- **Recherche** : par titre, ingrédients, notes…
- **Frigo** : indiquer les ingrédients disponibles → recettes triées par % de correspondance
- **Menus de la semaine** : planifier midi/soir, remplissage automatique, navigation semaine
- **Liste de courses** : générée à partir des repas planifiés
- **Installation** : bannière d’installation + instructions iOS / navigateur
- **Hors-ligne** : service worker + IndexedDB (données stockées localement dans le navigateur)

## Utilisation

1. Décompressez le ZIP
2. Servez le dossier avec un serveur HTTP local (obligatoire pour la caméra, le service worker et l’installation PWA)

Exemples :

```bash
# Python
cd recipe-pwa
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code / Cursor : extension "Live Server"
```

Puis ouvrez `http://localhost:8080` dans Chrome, Edge, Safari ou Firefox.

### Installer comme application

- **Android / Chrome / Edge** : bannière « Installer » ou menu ⋮ → « Installer l’application »
- **iPhone / iPad (Safari)** : Partager → « Sur l’écran d’accueil »

## Données

Tout est stocké **localement** dans le navigateur (IndexedDB). Aucun compte, aucun serveur.  
Attention : vider les données du site ou changer de navigateur efface les recettes. Pensez à une future export/import si besoin.

## Structure

```
recipe-pwa/
├── index.html
├── manifest.json
├── sw.js
├── css/styles.css
├── js/db.js
├── js/app.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```
