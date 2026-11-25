# Mes Recettes — PWA

Application web progressive pour enregistrer, classer et retrouver vos recettes, générer des menus de la semaine et la liste de courses.

## Fonctionnalités

- **Recettes** : créer, modifier, supprimer (titre, catégorie, temps, portions, source, ingrédients, étapes, notes, photo)
- **Photos** : galerie ou appareil photo, compression automatique
- **Catégories** : Entrée, Plat, Dessert, Légumes, Fruits, Viandes, Poisson, Sauce, Base/Pâte, Boisson, Autre
- **Favoris** ★ et filtre **⚡ < 30 min**
- **Quantités scalables** : ×½, ×1, ×2, ×3 sur la fiche recette
- **Recherche** par titre, ingrédients, notes…
- **Frigo** : ingrédients disponibles → recettes triées par % de correspondance
- **Menus de la semaine** + liste de courses
- **Export / import JSON** (sauvegarde complète ou une recette)
- **Partage famille** : fichier JSON entre appareils + partage texte / Web Share
- **Import depuis une URL** (schema.org JSON-LD, microdata, heuristiques HTML)
- **Installation** PWA + mode hors-ligne

## Utilisation

```bash
cd recipe-pwa
python3 -m http.server 8080
# ou : npx serve .
```

Ouvrez `http://localhost:8080`.

### Partage famille

1. Appareil A → Accueil → **Sauvegarde & partage** → Exporter JSON  
2. Envoyer le fichier (WhatsApp, Drive, mail…)  
3. Appareil B → Importer (fusionner)  

Une seule recette : ouvrir la fiche → 💾 ou 📤.

### Import URL

Bouton 🔗 dans la liste des recettes, ou depuis Sauvegarde & partage.  
Si le site bloque le téléchargement (CORS), collez le HTML de la page dans le champ prévu.

## Données

Stockage **local** (IndexedDB). Aucun compte serveur.  
Exportez régulièrement pour ne pas perdre vos recettes.
