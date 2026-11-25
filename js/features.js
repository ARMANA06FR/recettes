/* Features: export/import, share, scale, URL import, favorites helpers */

/* ===== Parse prep time to minutes ===== */
function parsePrepMinutes(str) {
  if (!str) return null;
  const s = String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let total = 0;
  const hourMatch = s.match(/(\d+)\s*h/);
  const minMatch = s.match(/(\d+)\s*m/);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);
  if (!hourMatch && !minMatch) {
    const n = parseInt(s.replace(/[^\d]/g, ''), 10);
    if (!isNaN(n)) total = n;
  }
  return total > 0 ? total : null;
}

function isQuickRecipe(r) {
  const m = parsePrepMinutes(r.prepTime);
  return m !== null && m <= 30;
}

/* ===== Scale ingredient quantities ===== */
function scaleIngredientLine(line, factor) {
  if (!line || factor === 1) return line;
  // Match numbers: 200, 1.5, 1,5, 1/2, ½, ¾ at start or after space
  return line.replace(/(\d+([.,]\d+)?|\d+\/\d+|[½¼¾⅓⅔⅛⅜⅝⅞])/g, (match) => {
    let n;
    if (match.includes('/')) {
      const [a, b] = match.split('/').map(Number);
      n = a / b;
    } else if ('½¼¾⅓⅔⅛⅜⅝⅞'.includes(match)) {
      const map = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
      n = map[match];
    } else {
      n = parseFloat(match.replace(',', '.'));
    }
    if (isNaN(n)) return match;
    let scaled = n * factor;
    // Nice formatting
    if (Math.abs(scaled - Math.round(scaled)) < 0.01) return String(Math.round(scaled));
    if (Math.abs(scaled * 2 - Math.round(scaled * 2)) < 0.01) {
      const half = Math.round(scaled * 2);
      if (half === 1) return '½';
      return (half / 2).toString().replace('.', ',');
    }
    // fractions for thirds
    const rounded = Math.round(scaled * 100) / 100;
    return String(rounded).replace('.', ',');
  });
}

function scaleServings(servings, factor) {
  if (!servings) return servings;
  return String(servings).replace(/(\d+([.,]\d+)?)/g, (m) => {
    const n = parseFloat(m.replace(',', '.')) * factor;
    if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
    return String(Math.round(n * 10) / 10).replace('.', ',');
  });
}

/* ===== Export / Import ===== */
async function buildBackupPayload() {
  const recipes = await getAllRecipes();
  const fridge = await getFridge();
  // menus: export current + try to get a few recent weeks is complex; export all menus via store
  const database = await openDB();
  const menus = await new Promise((resolve, reject) => {
    const tx = database.transaction('menus', 'readonly');
    const req = tx.objectStore('menus').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  return {
    app: 'Mes Recettes',
    version: 2,
    exportedAt: new Date().toISOString(),
    recipes,
    fridge,
    menus
  };
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportAllData() {
  const payload = await buildBackupPayload();
  const date = new Date().toISOString().slice(0, 10);
  downloadJSON(payload, `mes-recettes-sauvegarde-${date}.json`);
  toast('Sauvegarde téléchargée ✓');
}

async function exportSingleRecipe(id) {
  const r = await getRecipe(id);
  if (!r) return;
  const payload = {
    app: 'Mes Recettes',
    version: 2,
    type: 'single-recipe',
    exportedAt: new Date().toISOString(),
    recipe: r
  };
  const safe = (r.title || 'recette').replace(/[^\w\u00C0-\u024F\s-]/g, '').slice(0, 40).trim().replace(/\s+/g, '-');
  downloadJSON(payload, `recette-${safe}.json`);
  toast('Recette exportée ✓');
}

async function shareRecipe(id) {
  const r = await getRecipe(id);
  if (!r) return;
  const text = formatRecipeAsText(r);
  if (navigator.share) {
    try {
      await navigator.share({ title: r.title, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Recette copiée dans le presse-papiers');
  } catch {
    openModal(`
      <div class="modal-handle"></div>
      <h2 class="modal-title">Partager</h2>
      <textarea class="form-control" rows="12" readonly id="share-text">${escapeHtml(text)}</textarea>
      <div class="modal-actions">
        <button class="btn btn-primary btn-block" onclick="navigator.clipboard.writeText(document.getElementById('share-text').value).then(()=>{toast('Copié');closeModal()})">Copier</button>
      </div>
    `);
  }
}

function formatRecipeAsText(r) {
  const cat = CATEGORIES.find(c => c.id === r.category);
  let t = `${r.title}\n`;
  t += `${'─'.repeat(30)}\n`;
  if (cat) t += `Catégorie : ${cat.label}\n`;
  if (r.prepTime) t += `Temps : ${r.prepTime}\n`;
  if (r.servings) t += `Personnes : ${r.servings}\n`;
  if (r.source) t += `Source : ${r.source}\n`;
  t += `\nIngrédients :\n`;
  (r.ingredients || []).forEach(i => {
    const name = typeof i === 'string' ? i : (i.qty ? `${i.qty} ${i.name}` : i.name);
    t += `• ${name}\n`;
  });
  if (r.steps?.length) {
    t += `\nPréparation :\n`;
    r.steps.forEach((s, i) => { t += `${i + 1}. ${s}\n`; });
  }
  if (r.notes) t += `\nNotes : ${r.notes}\n`;
  t += `\n— Partagé via Mes Recettes`;
  return t;
}

async function importFromFile(file, mode = 'merge') {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    toast('Fichier JSON invalide');
    return { ok: false };
  }
  return importPayload(data, mode);
}

async function importPayload(data, mode = 'merge') {
  // Single recipe
  if (data.type === 'single-recipe' && data.recipe) {
    const r = { ...data.recipe };
    r.id = uid();
    r.createdAt = Date.now();
    r.updatedAt = Date.now();
    // Avoid huge photo issues is fine in IDB
    await saveRecipe(r);
    toast(`Recette « ${r.title} » importée ✓`);
    return { ok: true, count: 1 };
  }

  if (!data.recipes || !Array.isArray(data.recipes)) {
    toast('Format de sauvegarde non reconnu');
    return { ok: false };
  }

  let count = 0;
  if (mode === 'replace') {
    const existing = await getAllRecipes();
    for (const e of existing) await deleteRecipe(e.id);
  }

  for (const r of data.recipes) {
    const recipe = { ...r };
    if (mode === 'merge') {
      // New id to avoid overwriting same id from another device
      recipe.id = uid();
    }
    recipe.updatedAt = Date.now();
    if (!recipe.createdAt) recipe.createdAt = recipe.updatedAt;
    await saveRecipe(recipe);
    count++;
  }

  if (data.fridge && Array.isArray(data.fridge) && mode === 'replace') {
    await clearFridge();
    for (const f of data.fridge) {
      await addFridgeItem(f.displayName || f.name);
    }
  }

  if (data.menus && Array.isArray(data.menus)) {
    for (const m of data.menus) {
      await saveMenu(m);
    }
  }

  toast(`${count} recette${count > 1 ? 's' : ''} importée${count > 1 ? 's' : ''} ✓`);
  return { ok: true, count };
}

/* ===== URL import (JSON-LD + basic HTML) ===== */
function withTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    try { return AbortSignal.timeout(ms); } catch (_) {}
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: opts.signal || withTimeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchRecipeFromUrl(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('L\'URL doit commencer par http:// ou https://');
  }

  const attempts = [];
  let lastError = null;

  // 1) Jina Reader — renvoie souvent le HTML lisible sans CORS côté site cible
  attempts.push(async () => {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'X-Return-Format': 'html', Accept: 'text/html' },
      signal: withTimeout(20000)
    });
    if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
    const html = await res.text();
    if (!html || html.length < 150) throw new Error('Jina: contenu vide');
    // Si c\'est du markdown (pas de HTML), on parse quand même
    if (!html.includes('<') && html.includes('Markdown Content')) {
      return parseRecipeFromMarkdown(html, url);
    }
    return parseRecipeFromHtml(html, url);
  });

  // 2) Jina en markdown (plus stable sur certains sites)
  attempts.push(async () => {
    const text = await fetchText(`https://r.jina.ai/${url}`);
    if (!text || text.length < 100) throw new Error('Jina markdown vide');
    return parseRecipeFromMarkdown(text, url);
  });

  // 3) allorigins /get (JSON { contents })
  attempts.push(async () => {
    const raw = await fetchText(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    const data = JSON.parse(raw);
    const html = data.contents || '';
    if (!html || html.length < 200) throw new Error('allorigins: contenu vide');
    return parseRecipeFromHtml(html, url);
  });

  // 4) allorigins /raw
  attempts.push(async () => {
    const html = await fetchText(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    if (!html || html.length < 200) throw new Error('allorigins raw: vide');
    return parseRecipeFromHtml(html, url);
  });

  // 5) Direct (échoue presque toujours à cause du CORS, mais au cas où)
  attempts.push(async () => {
    const html = await fetchText(url);
    return parseRecipeFromHtml(html, url);
  });

  for (const attempt of attempts) {
    try {
      const recipe = await attempt();
      if (recipe && recipe.title && (recipe.ingredients?.length || recipe.steps?.length)) {
        return recipe;
      }
      // titre seul : on accepte quand même si titre non générique
      if (recipe && recipe.title && recipe.title !== 'Recette importée') {
        return recipe;
      }
      lastError = new Error('Page récupérée mais aucune recette détectée');
    } catch (e) {
      lastError = e;
      console.warn('Import URL attempt failed:', e.message || e);
    }
  }

  const msg = (lastError && lastError.message) ? lastError.message : 'échec réseau';
  throw new Error(
    `Impossible de récupérer cette page automatiquement (${msg}). ` +
    'Utilisez le coller HTML : sur le site, cliquez droit → Afficher le code source → Ctrl+A → Ctrl+C, puis collez ci-dessous.'
  );
}

function parseRecipeFromMarkdown(md, sourceUrl) {
  const lines = md.split(/\n/);
  let title = '';
  const titleMatch = md.match(/^Title:\s*(.+)$/m);
  if (titleMatch) title = titleMatch[1].trim();
  if (!title) {
    const h = md.match(/^#+\s+(.+)$/m);
    if (h) title = h[1].trim();
  }
  if (!title) title = 'Recette importée';

  // Extract section after ## Ingrédients / Ingredients
  const ingredients = [];
  const steps = [];
  let mode = null;
  for (const line of lines) {
    const t = line.trim();
    if (/^#+\s*(ingr[eé]dients?|ingredients?)/i.test(t)) { mode = 'ing'; continue; }
    if (/^#+\s*(pr[eé]paration|instructions?|steps?|directions?|m[eé]thode)/i.test(t)) { mode = 'steps'; continue; }
    if (/^#+\s/.test(t) && mode) { mode = null; continue; }
    if (!t || t.startsWith('![') || t.startsWith('http') || t.startsWith('URL Source')) continue;
    // bullet or numbered
    const bullet = t.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (!bullet || bullet.length < 2) continue;
    // skip nav crumbs
    if (/^(accueil|recettes|dessert|plat)/i.test(bullet) && bullet.length < 40) continue;
    if (mode === 'ing') ingredients.push(bullet);
    else if (mode === 'steps') steps.push(bullet);
  }

  // Time heuristic
  let prepTime = '';
  const timeMatch = md.match(/(\d+\s*min)/i);
  if (timeMatch) prepTime = timeMatch[1];

  return {
    title,
    category: 'plat',
    prepTime,
    servings: '',
    source: sourceUrl || '',
    ingredients: ingredients.length ? ingredients : [''],
    steps: steps.length ? steps : [''],
    notes: ingredients.length || steps.length
      ? 'Import automatique (markdown) — vérifiez les quantités.'
      : 'Import partiel — complétez manuellement.',
    photo: null,
    favorite: false
  };
}

function parseRecipeFromHtml(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1) JSON-LD schema.org/Recipe
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const script of scripts) {
    try {
      let json = JSON.parse(script.textContent);
      if (Array.isArray(json)) json = json.find(x => x['@type'] === 'Recipe' || (Array.isArray(x['@type']) && x['@type'].includes('Recipe'))) || json[0];
      if (json['@graph']) {
        json = json['@graph'].find(x => x['@type'] === 'Recipe' || (Array.isArray(x['@type']) && x['@type'].includes('Recipe')));
      }
      if (json && (json['@type'] === 'Recipe' || (Array.isArray(json['@type']) && json['@type'].includes('Recipe')))) {
        return mapJsonLdRecipe(json, sourceUrl);
      }
    } catch { /* continue */ }
  }

  // 2) Microdata
  const recipeEl = doc.querySelector('[itemtype*="schema.org/Recipe"]');
  if (recipeEl) {
    const get = (prop) => {
      const el = recipeEl.querySelector(`[itemprop="${prop}"]`);
      if (!el) return '';
      if (el.getAttribute('content')) return el.getAttribute('content');
      return el.textContent.trim();
    };
    const ings = [...recipeEl.querySelectorAll('[itemprop="recipeIngredient"]')].map(e => e.textContent.trim()).filter(Boolean);
    const steps = [...recipeEl.querySelectorAll('[itemprop="recipeInstructions"]')].map(e => {
      if (e.querySelector('[itemprop="text"]')) return e.querySelector('[itemprop="text"]').textContent.trim();
      return e.textContent.trim();
    }).filter(Boolean);
    return {
      title: get('name') || doc.title || 'Recette importée',
      category: 'plat',
      prepTime: get('totalTime') || get('prepTime') || '',
      servings: get('recipeYield') || '',
      source: sourceUrl || '',
      ingredients: ings.length ? ings : [''],
      steps: steps.length ? steps : [''],
      notes: '',
      photo: null,
      favorite: false
    };
  }

  // 3) Heuristic: h1 + lists
  const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || 'Recette importée';
  const lists = [...doc.querySelectorAll('ul, ol')];
  let ingredients = [];
  let steps = [];
  for (const list of lists) {
    const items = [...list.querySelectorAll('li')].map(li => li.textContent.trim()).filter(t => t.length > 2 && t.length < 200);
    if (items.length < 2) continue;
    const text = (list.previousElementSibling?.textContent || list.className || '').toLowerCase();
    if (/ingredient|ingrédient/.test(text) || (!ingredients.length && items.length >= 3)) {
      if (!ingredients.length) ingredients = items;
    } else if (/etape|étape|instruction|préparation|method/.test(text) || list.tagName === 'OL') {
      if (!steps.length) steps = items;
    }
  }
  return {
    title,
    category: 'plat',
    prepTime: '',
    servings: '',
    source: sourceUrl || '',
    ingredients: ingredients.length ? ingredients : [''],
    steps: steps.length ? steps : [''],
    notes: 'Import automatique — vérifiez et complétez si besoin.',
    photo: null,
    favorite: false
  };
}

function mapJsonLdRecipe(json, sourceUrl) {
  const ings = (json.recipeIngredient || []).map(String);
  let steps = [];
  const inst = json.recipeInstructions;
  if (typeof inst === 'string') steps = [inst];
  else if (Array.isArray(inst)) {
    steps = inst.map(s => {
      if (typeof s === 'string') return s;
      if (s.text) return s.text;
      if (s.itemListElement) {
        return (Array.isArray(s.itemListElement) ? s.itemListElement : [s.itemListElement])
          .map(x => x.text || x.name || '').filter(Boolean).join('\n');
      }
      return s.name || '';
    }).filter(Boolean);
  }

  let prepTime = '';
  const pt = json.totalTime || json.prepTime || json.cookTime || '';
  if (typeof pt === 'string') {
    // ISO 8601 duration PT1H30M
    const m = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
    if (m) {
      const parts = [];
      if (m[1]) parts.push(`${m[1]} h`);
      if (m[2]) parts.push(`${m[2]} min`);
      prepTime = parts.join(' ') || pt;
    } else prepTime = pt;
  }

  let servings = '';
  if (json.recipeYield) {
    servings = Array.isArray(json.recipeYield) ? String(json.recipeYield[0]) : String(json.recipeYield);
  }

  let photo = null;
  if (json.image) {
    if (typeof json.image === 'string') photo = null; // external URL, skip storing remote by default (CORS/offline)
    else if (json.image.url) photo = null;
    else if (Array.isArray(json.image) && typeof json.image[0] === 'string') photo = null;
  }

  return {
    title: json.name || 'Recette importée',
    category: 'plat',
    prepTime,
    servings,
    source: sourceUrl || json.mainEntityOfPage || '',
    ingredients: ings.length ? ings : [''],
    steps: steps.length ? steps : [''],
    notes: json.description ? String(json.description).slice(0, 500) : '',
    photo,
    favorite: false
  };
}

function parseRecipeFromHtmlText(html, sourceUrl) {
  return parseRecipeFromHtml(html, sourceUrl || '');
}
