/* IndexedDB wrapper for recipes, fridge ingredients, and weekly menus */

const DB_NAME = 'mes-recettes-db';
const DB_VERSION = 1;

const CATEGORIES = [
  { id: 'entree', label: 'Entrée', emoji: '🥗' },
  { id: 'plat', label: 'Plat', emoji: '🍽️' },
  { id: 'dessert', label: 'Dessert', emoji: '🍰' },
  { id: 'legumes', label: 'Légumes', emoji: '🥦' },
  { id: 'fruits', label: 'Fruits', emoji: '🍎' },
  { id: 'viandes', label: 'Viandes', emoji: '🥩' },
  { id: 'poisson', label: 'Poisson', emoji: '🐟' },
  { id: 'sauce', label: 'Sauce', emoji: '🥣' },
  { id: 'base', label: 'Base / Pâte', emoji: '🥖' },
  { id: 'boisson', label: 'Boisson', emoji: '🥤' },
  { id: 'autre', label: 'Autre', emoji: '✨' }
];

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MEAL_TYPES = [
  { id: 'midi', label: 'Midi' },
  { id: 'soir', label: 'Soir' }
];

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('recipes')) {
        const store = database.createObjectStore('recipes', { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('fridge')) {
        database.createObjectStore('fridge', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('menus')) {
        database.createObjectStore('menus', { keyPath: 'weekKey' });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/* ===== Recipes ===== */
async function getAllRecipes() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('recipes', 'readonly');
    const req = tx.objectStore('recipes').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getRecipe(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('recipes', 'readonly');
    const req = tx.objectStore('recipes').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecipe(recipe) {
  const database = await openDB();
  if (!recipe.id) recipe.id = uid();
  recipe.updatedAt = Date.now();
  if (!recipe.createdAt) recipe.createdAt = recipe.updatedAt;
  return new Promise((resolve, reject) => {
    const tx = database.transaction('recipes', 'readwrite');
    const req = tx.objectStore('recipes').put(recipe);
    req.onsuccess = () => resolve(recipe);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRecipe(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('recipes', 'readwrite');
    const req = tx.objectStore('recipes').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ===== Fridge ingredients ===== */
async function getFridge() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('fridge', 'readonly');
    const req = tx.objectStore('fridge').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function addFridgeItem(name) {
  const database = await openDB();
  const item = { id: uid(), name: name.trim().toLowerCase(), displayName: name.trim(), addedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = database.transaction('fridge', 'readwrite');
    const req = tx.objectStore('fridge').put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

async function removeFridgeItem(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('fridge', 'readwrite');
    const req = tx.objectStore('fridge').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearFridge() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('fridge', 'readwrite');
    const req = tx.objectStore('fridge').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ===== Weekly menus ===== */
function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // ISO week: Monday as first day
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekDates(weekKey) {
  // Approximate Monday of that week
  const [year, week] = weekKey.split('-W').map(Number);
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const monday = new Date(simple);
  if (dow <= 4) monday.setDate(simple.getDate() - simple.getDay() + 1);
  else monday.setDate(simple.getDate() + 8 - simple.getDay());
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

async function getMenu(weekKey) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('menus', 'readonly');
    const req = tx.objectStore('menus').get(weekKey);
    req.onsuccess = () => {
      const data = req.result || { weekKey, meals: {} };
      resolve(data);
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveMenu(menu) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('menus', 'readwrite');
    const req = tx.objectStore('menus').put(menu);
    req.onsuccess = () => resolve(menu);
    req.onerror = () => reject(req.error);
  });
}

/* ===== Settings ===== */
async function getSetting(key, defaultValue = null) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
    req.onerror = () => reject(req.error);
  });
}

async function setSetting(key, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readwrite');
    const req = tx.objectStore('settings').put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ===== Search helpers ===== */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function recipeMatchesIngredients(recipe, fridgeNames) {
  if (!fridgeNames.length) return { score: 0, matched: [], missing: [] };
  const recipeIngs = (recipe.ingredients || []).map(i => normalize(typeof i === 'string' ? i : i.name));
  const matched = [];
  const missing = [];
  recipeIngs.forEach(ing => {
    const found = fridgeNames.some(f => ing.includes(f) || f.includes(ing));
    if (found) matched.push(ing);
    else missing.push(ing);
  });
  const score = recipeIngs.length ? matched.length / recipeIngs.length : 0;
  return { score, matched, missing };
}

function searchRecipes(recipes, query) {
  const q = normalize(query);
  if (!q) return recipes;
  return recipes.filter(r => {
    const title = normalize(r.title);
    const cat = normalize(r.category);
    const notes = normalize(r.notes);
    const ings = (r.ingredients || []).map(i => normalize(typeof i === 'string' ? i : i.name)).join(' ');
    return title.includes(q) || cat.includes(q) || notes.includes(q) || ings.includes(q);
  });
}
