/* Mes Recettes — Main application logic */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const state = {
  view: 'home',
  recipes: [],
  fridge: [],
  currentCategory: 'all',
  searchQuery: '',
  editingId: null,
  currentWeekKey: getWeekKey(),
  menu: null,
  deferredPrompt: null
};

/* ===== Toast ===== */
let toastTimer;
function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ===== Modal ===== */
function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal-sheet">${html}</div></div>`;
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}
function closeModal() {
  $('#modal-root').innerHTML = '';
}

/* ===== Navigation ===== */
function setView(view, params = {}) {
  state.view = view;
  $$('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view || (view === 'detail' && btn.dataset.view === 'recipes') || (view === 'edit' && btn.dataset.view === 'add'));
  });
  // Special: detail & edit don't highlight nav the same way
  if (view === 'detail' || view === 'edit') {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    if (view === 'edit') $('[data-view="add"]')?.classList.add('active');
    else $('[data-view="recipes"]')?.classList.add('active');
  }
  render();
  window.scrollTo(0, 0);
  $('#main').scrollTop = 0;
}

$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    if (v === 'add') {
      state.editingId = null;
      setView('edit');
    } else {
      setView(v);
    }
  });
});

/* ===== Search toggle ===== */
$('#btn-search-toggle').addEventListener('click', () => {
  const bar = $('#search-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    $('#search-input').focus();
  } else {
    state.searchQuery = '';
    $('#search-input').value = '';
    if (state.view === 'recipes' || state.view === 'home') render();
  }
});
$('#btn-clear-search').addEventListener('click', () => {
  $('#search-input').value = '';
  state.searchQuery = '';
  render();
});
$('#search-input').addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  if (state.view === 'recipes' || state.view === 'home') render();
});

/* ===== Install prompt ===== */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredPrompt = e;
  showInstallBanner();
});

async function showInstallBanner() {
  const dismissed = await getSetting('installDismissed', false);
  if (dismissed || !state.deferredPrompt) return;
  // Also check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  $('#install-banner').classList.remove('hidden');
}

$('#btn-install')?.addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  const { outcome } = await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  $('#install-banner').classList.add('hidden');
  if (outcome === 'accepted') toast('Application installée 🎉');
});

$('#btn-dismiss-install')?.addEventListener('click', async () => {
  $('#install-banner').classList.add('hidden');
  await setSetting('installDismissed', true);
});

// Manual install helper for iOS / browsers without beforeinstallprompt
function showInstallHelp() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone) {
    toast('L\'application est déjà installée');
    return;
  }
  if (isIOS) {
    openModal(`
      <div class="modal-handle"></div>
      <h2 class="modal-title">Installer sur iPhone / iPad</h2>
      <ol style="padding-left:20px;line-height:1.8;font-size:0.95rem">
        <li>Appuyez sur le bouton <strong>Partager</strong> <span style="font-size:1.2em">⎋</span> en bas de Safari</li>
        <li>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong></li>
        <li>Confirmez en appuyant sur <strong>Ajouter</strong></li>
      </ol>
      <div class="modal-actions">
        <button class="btn btn-primary btn-block" onclick="closeModal()">Compris</button>
      </div>
    `);
  } else if (state.deferredPrompt) {
    state.deferredPrompt.prompt();
  } else {
    openModal(`
      <div class="modal-handle"></div>
      <h2 class="modal-title">Installer l'application</h2>
      <p style="margin-bottom:16px;color:var(--ink-soft);font-size:0.95rem">
        Ouvrez le menu de votre navigateur (⋮ ou ⋯) et choisissez
        <strong>« Installer l'application »</strong> ou
        <strong>« Ajouter à l'écran d'accueil »</strong>.
      </p>
      <div class="modal-actions">
        <button class="btn btn-primary btn-block" onclick="closeModal()">Compris</button>
      </div>
    `);
  }
}

/* ===== Render engine ===== */
async function loadData() {
  state.recipes = await getAllRecipes();
  state.recipes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  state.fridge = await getFridge();
  state.menu = await getMenu(state.currentWeekKey);
}

async function render() {
  await loadData();
  const main = $('#main');
  switch (state.view) {
    case 'home': main.innerHTML = renderHome(); break;
    case 'recipes': main.innerHTML = renderRecipesList(); break;
    case 'detail': main.innerHTML = await renderDetail(state.detailId); break;
    case 'edit': main.innerHTML = await renderEditForm(state.editingId); bindEditForm(); break;
    case 'menu': main.innerHTML = await renderMenuView(); bindMenuView(); break;
    case 'ingredients': main.innerHTML = renderFridgeView(); bindFridgeView(); break;
    default: main.innerHTML = renderHome();
  }
}

/* ===== HOME ===== */
function renderHome() {
  const count = state.recipes.length;
  const recent = state.recipes.slice(0, 4);
  const hour = new Date().getHours();
  let greeting = 'Bonjour';
  if (hour >= 18) greeting = 'Bonsoir';
  else if (hour >= 12) greeting = 'Bon après-midi';

  return `
    <div class="page">
      <div class="home-hero">
        <h2>${greeting} 👋</h2>
        <p>${count === 0 ? 'Commencez par ajouter votre première recette.' : `Vous avez ${count} recette${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''}.`}</p>
        <button class="btn btn-primary" onclick="state.editingId=null;setView('edit')">
          + Nouvelle recette
        </button>
      </div>

      <div class="stats-row">
        <div class="stat-pill"><div class="num">${count}</div><div class="label">Recettes</div></div>
        <div class="stat-pill"><div class="num">${state.fridge.length}</div><div class="label">Ingrédients</div></div>
        <div class="stat-pill"><div class="num">${countPlannedMeals()}</div><div class="label">Repas planifiés</div></div>
      </div>

      <div class="quick-actions">
        <button class="quick-action" onclick="setView('ingredients')">
          <div class="qa-icon">🧊</div>
          <strong>Que cuisiner ?</strong>
          <span>Avec ce qu'il y a au frigo</span>
        </button>
        <button class="quick-action" onclick="setView('menu')">
          <div class="qa-icon">📅</div>
          <strong>Menu de la semaine</strong>
          <span>Planifier & liste de courses</span>
        </button>
        <button class="quick-action" onclick="setView('recipes')">
          <div class="qa-icon">📖</div>
          <strong>Toutes les recettes</strong>
          <span>Parcourir & filtrer</span>
        </button>
        <button class="quick-action" onclick="showInstallHelp()">
          <div class="qa-icon">📲</div>
          <strong>Installer l'app</strong>
          <span>Sur l'écran d'accueil</span>
        </button>
      </div>

      ${recent.length ? `
        <div class="section-title">Récemment ajoutées</div>
        <div class="recipe-grid">
          ${recent.map(r => recipeCardHTML(r)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function countPlannedMeals() {
  if (!state.menu || !state.menu.meals) return 0;
  return Object.values(state.menu.meals).filter(Boolean).length;
}

function recipeCardHTML(r) {
  const cat = CATEGORIES.find(c => c.id === r.category) || CATEGORIES.find(c => c.id === 'autre');
  const img = r.photo
    ? `<img src="${r.photo}" alt="${escapeAttr(r.title)}" loading="lazy" />`
    : `<div class="placeholder">${cat.emoji}</div>`;
  return `
    <article class="recipe-card" onclick="openRecipe('${r.id}')">
      <div class="recipe-card-img">${img}</div>
      <div class="recipe-card-body">
        <h3>${escapeHtml(r.title)}</h3>
        <div class="recipe-card-meta">
          <span class="tag ${r.category}">${cat.label}</span>
        </div>
      </div>
    </article>
  `;
}

function openRecipe(id) {
  state.detailId = id;
  setView('detail');
}

/* ===== RECIPES LIST ===== */
function renderRecipesList() {
  let list = state.recipes;
  if (state.currentCategory !== 'all') {
    list = list.filter(r => r.category === state.currentCategory);
  }
  if (state.searchQuery) {
    list = searchRecipes(list, state.searchQuery);
  }

  const chips = `
    <div class="chips">
      <button class="chip ${state.currentCategory === 'all' ? 'active' : ''}" onclick="filterCategory('all')">Toutes</button>
      ${CATEGORIES.map(c => `
        <button class="chip ${state.currentCategory === c.id ? 'active' : ''}" onclick="filterCategory('${c.id}')">
          ${c.emoji} ${c.label}
        </button>
      `).join('')}
    </div>
  `;

  return `
    <div class="page">
      <div class="section-title">
        <span>Mes recettes</span>
        <button class="btn btn-secondary btn-sm" onclick="state.editingId=null;setView('edit')">+ Ajouter</button>
      </div>
      ${chips}
      ${list.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>Aucune recette</h3>
          <p>${state.searchQuery || state.currentCategory !== 'all' ? 'Aucun résultat pour ce filtre.' : 'Ajoutez votre première recette pour commencer.'}</p>
          <button class="btn btn-primary" onclick="state.editingId=null;setView('edit')">Créer une recette</button>
        </div>
      ` : `
        <div class="recipe-grid">
          ${list.map(r => recipeCardHTML(r)).join('')}
        </div>
      `}
    </div>
  `;
}

function filterCategory(id) {
  state.currentCategory = id;
  render();
}

/* ===== DETAIL ===== */
async function renderDetail(id) {
  const r = await getRecipe(id);
  if (!r) {
    return `<div class="page"><div class="empty-state"><h3>Recette introuvable</h3><button class="btn btn-primary" onclick="setView('recipes')">Retour</button></div></div>`;
  }
  const cat = CATEGORIES.find(c => c.id === r.category) || CATEGORIES.find(c => c.id === 'autre');
  const img = r.photo
    ? `<img src="${r.photo}" alt="${escapeAttr(r.title)}" />`
    : '';

  const ingredients = (r.ingredients || []).map(i => {
    const name = typeof i === 'string' ? i : (i.qty ? `${i.qty} ${i.name}` : i.name);
    return `<li><span>•</span><span>${escapeHtml(name)}</span></li>`;
  }).join('');

  const steps = (r.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');

  return `
    <div class="detail-hero">
      ${img || `<div style="width:100%;height:100%;display:grid;place-items:center;font-size:4rem;opacity:0.4">${cat.emoji}</div>`}
      <button class="back-btn" onclick="setView('recipes')" aria-label="Retour">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
    </div>
    <div class="detail-body">
      <h1>${escapeHtml(r.title)}</h1>
      <div class="detail-meta">
        <span class="meta-chip">${cat.emoji} ${cat.label}</span>
        ${r.prepTime ? `<span class="meta-chip">⏱️ ${escapeHtml(r.prepTime)}</span>` : ''}
        ${r.servings ? `<span class="meta-chip">👥 ${escapeHtml(r.servings)}</span>` : ''}
        ${r.source ? `<span class="meta-chip">📚 ${escapeHtml(r.source)}</span>` : ''}
      </div>
      <div class="detail-actions">
        <button class="btn btn-secondary" onclick="state.editingId='${r.id}';setView('edit')">✏️ Modifier</button>
        <button class="btn btn-ghost" onclick="confirmDelete('${r.id}')">🗑️ Supprimer</button>
      </div>
      ${r.ingredients && r.ingredients.length ? `
        <div class="detail-section">
          <h2>Ingrédients</h2>
          <ul class="ing-checklist">${ingredients}</ul>
        </div>
      ` : ''}
      ${r.steps && r.steps.length ? `
        <div class="detail-section">
          <h2>Préparation</h2>
          <ol class="steps-list">${steps}</ol>
        </div>
      ` : ''}
      ${r.notes ? `
        <div class="detail-section">
          <h2>Notes</h2>
          <p style="font-size:0.95rem;line-height:1.6;color:var(--ink-soft)">${escapeHtml(r.notes)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

function confirmDelete(id) {
  openModal(`
    <div class="modal-handle"></div>
    <h2 class="modal-title">Supprimer cette recette ?</h2>
    <p style="color:var(--ink-soft);margin-bottom:8px">Cette action est irréversible.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="doDelete('${id}')">Supprimer</button>
    </div>
  `);
}

async function doDelete(id) {
  await deleteRecipe(id);
  closeModal();
  toast('Recette supprimée');
  setView('recipes');
}

/* ===== EDIT / ADD FORM ===== */
async function renderEditForm(id) {
  let r = {
    title: '', category: 'plat', ingredients: [''], steps: [''],
    prepTime: '', servings: '', source: '', notes: '', photo: null
  };
  if (id) {
    const existing = await getRecipe(id);
    if (existing) r = { ...r, ...existing, ingredients: existing.ingredients?.length ? existing.ingredients : [''], steps: existing.steps?.length ? existing.steps : [''] };
  }

  const catOptions = CATEGORIES.map(c =>
    `<option value="${c.id}" ${r.category === c.id ? 'selected' : ''}>${c.emoji} ${c.label}</option>`
  ).join('');

  const ingRows = (r.ingredients || ['']).map((ing, i) => {
    const val = typeof ing === 'string' ? ing : (ing.qty ? `${ing.qty} ${ing.name}` : ing.name || '');
    return `
      <div class="ing-row" data-idx="${i}">
        <input class="form-control" type="text" name="ingredient" value="${escapeAttr(val)}" placeholder="ex: 200 g de farine" />
        <button type="button" class="btn-icon" onclick="removeIngRow(this)" aria-label="Supprimer">×</button>
      </div>
    `;
  }).join('');

  const stepRows = (r.steps || ['']).map((s, i) => `
    <div class="ing-row" data-idx="${i}">
      <textarea class="form-control" name="step" rows="2" placeholder="Étape ${i + 1}…">${escapeHtml(s)}</textarea>
      <button type="button" class="btn-icon" onclick="removeStepRow(this)" aria-label="Supprimer">×</button>
    </div>
  `).join('');

  return `
    <div class="page">
      <div class="section-title">
        <span>${id ? 'Modifier la recette' : 'Nouvelle recette'}</span>
      </div>
      <form id="recipe-form" onsubmit="return false;">
        <div class="form-group">
          <label>Photo</label>
          <div class="photo-area ${r.photo ? 'has-img' : ''}" id="photo-area">
            ${r.photo ? `<img id="photo-preview" src="${r.photo}" alt="" />` : `
              <div class="photo-placeholder">
                <span>📷</span>
                Appuyez pour ajouter une photo
              </div>
            `}
            <div class="photo-actions" style="${r.photo ? '' : 'display:none'}">
              <button type="button" class="btn btn-sm btn-secondary" id="btn-change-photo">Changer</button>
              <button type="button" class="btn btn-sm btn-ghost" id="btn-remove-photo" style="background:rgba(0,0,0,0.5);color:white">×</button>
            </div>
          </div>
          <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none" />
        </div>

        <div class="form-group">
          <label for="f-title">Titre *</label>
          <input class="form-control" id="f-title" type="text" required value="${escapeAttr(r.title)}" placeholder="Nom de la recette" />
        </div>

        <div class="form-group">
          <label for="f-category">Catégorie</label>
          <select class="form-control" id="f-category">${catOptions}</select>
        </div>

        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label for="f-prep">Temps</label>
            <input class="form-control" id="f-prep" type="text" value="${escapeAttr(r.prepTime || '')}" placeholder="30 min" />
          </div>
          <div>
            <label for="f-servings">Personnes</label>
            <input class="form-control" id="f-servings" type="text" value="${escapeAttr(r.servings || '')}" placeholder="4" />
          </div>
        </div>

        <div class="form-group">
          <label for="f-source">Source <span class="text-muted">(livre, site…)</span></label>
          <input class="form-control" id="f-source" type="text" value="${escapeAttr(r.source || '')}" placeholder="ex: Livre de grand-mère, marmiton.org…" />
        </div>

        <div class="form-group">
          <label>Ingrédients</label>
          <div class="ing-list" id="ing-list">${ingRows}</div>
          <button type="button" class="btn btn-secondary btn-sm mt-8" id="btn-add-ing">+ Ingrédient</button>
        </div>

        <div class="form-group">
          <label>Étapes de préparation</label>
          <div class="ing-list" id="steps-list">${stepRows}</div>
          <button type="button" class="btn btn-secondary btn-sm mt-8" id="btn-add-step">+ Étape</button>
        </div>

        <div class="form-group">
          <label for="f-notes">Notes / Astuces</label>
          <textarea class="form-control" id="f-notes" rows="3" placeholder="Conseils, variantes…">${escapeHtml(r.notes || '')}</textarea>
        </div>

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" class="btn btn-ghost btn-block" onclick="setView(state.editingId ? 'detail' : 'recipes');state.detailId=state.editingId">Annuler</button>
          <button type="button" class="btn btn-primary btn-block" id="btn-save-recipe">Enregistrer</button>
        </div>
      </form>
    </div>
  `;
}

function bindEditForm() {
  const photoArea = $('#photo-area');
  const photoInput = $('#photo-input');
  let currentPhoto = null;

  // Restore existing photo from preview if present
  const preview = $('#photo-preview');
  if (preview) currentPhoto = preview.src;

  photoArea?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-remove-photo') || e.target.closest('#btn-change-photo')) return;
    photoInput.click();
  });
  $('#btn-change-photo')?.addEventListener('click', (e) => {
    e.stopPropagation();
    photoInput.click();
  });
  $('#btn-remove-photo')?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentPhoto = null;
    photoArea.classList.remove('has-img');
    photoArea.innerHTML = `
      <div class="photo-placeholder"><span>📷</span>Appuyez pour ajouter une photo</div>
      <div class="photo-actions" style="display:none">
        <button type="button" class="btn btn-sm btn-secondary" id="btn-change-photo">Changer</button>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-remove-photo" style="background:rgba(0,0,0,0.5);color:white">×</button>
      </div>
    `;
    // Re-bind
    $('#btn-change-photo')?.addEventListener('click', (ev) => { ev.stopPropagation(); photoInput.click(); });
    $('#btn-remove-photo')?.addEventListener('click', (ev) => { ev.stopPropagation(); /* already handled by outer */ });
  });

  photoInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 900, 0.75);
      currentPhoto = dataUrl;
      photoArea.classList.add('has-img');
      photoArea.innerHTML = `
        <img id="photo-preview" src="${dataUrl}" alt="" />
        <div class="photo-actions">
          <button type="button" class="btn btn-sm btn-secondary" id="btn-change-photo">Changer</button>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-remove-photo" style="background:rgba(0,0,0,0.5);color:white">×</button>
        </div>
      `;
      $('#btn-change-photo')?.addEventListener('click', (ev) => { ev.stopPropagation(); photoInput.click(); });
      $('#btn-remove-photo')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        currentPhoto = null;
        photoArea.classList.remove('has-img');
        photoArea.innerHTML = `
          <div class="photo-placeholder"><span>📷</span>Appuyez pour ajouter une photo</div>
          <div class="photo-actions" style="display:none"></div>
        `;
      });
    } catch (err) {
      toast('Erreur lors du traitement de la photo');
      console.error(err);
    }
  });

  $('#btn-add-ing')?.addEventListener('click', () => {
    const list = $('#ing-list');
    const div = document.createElement('div');
    div.className = 'ing-row';
    div.innerHTML = `
      <input class="form-control" type="text" name="ingredient" placeholder="ex: 2 œufs" />
      <button type="button" class="btn-icon" onclick="removeIngRow(this)">×</button>
    `;
    list.appendChild(div);
  });

  $('#btn-add-step')?.addEventListener('click', () => {
    const list = $('#steps-list');
    const n = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'ing-row';
    div.innerHTML = `
      <textarea class="form-control" name="step" rows="2" placeholder="Étape ${n}…"></textarea>
      <button type="button" class="btn-icon" onclick="removeStepRow(this)">×</button>
    `;
    list.appendChild(div);
  });

  $('#btn-save-recipe')?.addEventListener('click', async () => {
    const title = $('#f-title').value.trim();
    if (!title) {
      toast('Le titre est obligatoire');
      $('#f-title').focus();
      return;
    }
    const ingredients = $$('input[name="ingredient"]').map(i => i.value.trim()).filter(Boolean);
    const steps = $$('textarea[name="step"]').map(t => t.value.trim()).filter(Boolean);

    const recipe = {
      id: state.editingId || undefined,
      title,
      category: $('#f-category').value,
      prepTime: $('#f-prep').value.trim(),
      servings: $('#f-servings').value.trim(),
      source: $('#f-source').value.trim(),
      notes: $('#f-notes').value.trim(),
      ingredients,
      steps,
      photo: currentPhoto
    };

    // Keep existing photo if editing and no change
    if (state.editingId && currentPhoto === null) {
      const existing = await getRecipe(state.editingId);
      // currentPhoto null means user removed it
      recipe.photo = null;
    } else if (state.editingId && !currentPhoto) {
      const existing = await getRecipe(state.editingId);
      if (existing?.photo) recipe.photo = existing.photo;
    }

    const saved = await saveRecipe(recipe);
    toast(state.editingId ? 'Recette mise à jour ✓' : 'Recette enregistrée ✓');
    state.detailId = saved.id;
    setView('detail');
  });
}

function removeIngRow(btn) {
  const list = $('#ing-list');
  if (list.children.length <= 1) {
    btn.parentElement.querySelector('input').value = '';
    return;
  }
  btn.parentElement.remove();
}
function removeStepRow(btn) {
  const list = $('#steps-list');
  if (list.children.length <= 1) {
    btn.parentElement.querySelector('textarea').value = '';
    return;
  }
  btn.parentElement.remove();
}

/* Compress image to dataURL */
function compressImage(file, maxWidth = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ===== FRIDGE / INGREDIENTS SEARCH ===== */
function renderFridgeView() {
  const tags = state.fridge.map(f => `
    <span class="fridge-tag">
      ${escapeHtml(f.displayName)}
      <button onclick="removeFridge('${f.id}')" aria-label="Retirer">×</button>
    </span>
  `).join('');

  const fridgeNames = state.fridge.map(f => f.name);
  let matches = [];
  if (fridgeNames.length) {
    matches = state.recipes
      .map(r => ({ recipe: r, ...recipeMatchesIngredients(r, fridgeNames) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  return `
    <div class="page">
      <div class="section-title">Ce que j'ai à la maison</div>
      <p class="text-muted text-sm mb-16">Ajoutez les ingrédients disponibles pour trouver des recettes qui matchent.</p>

      <div class="fridge-input-row">
        <input class="form-control" id="fridge-input" type="text" placeholder="ex: tomates, œufs, riz…" />
        <button class="btn btn-primary" id="btn-add-fridge">Ajouter</button>
      </div>

      <div class="fridge-tags" id="fridge-tags">
        ${tags || '<span class="text-muted text-sm">Aucun ingrédient pour le moment</span>'}
      </div>

      ${state.fridge.length ? `
        <div class="flex-between mb-16">
          <div class="section-title" style="margin:0">Recettes possibles</div>
          <button class="btn btn-ghost btn-sm" onclick="clearAllFridge()">Tout vider</button>
        </div>
        ${matches.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <h3>Aucune correspondance</h3>
            <p>Essayez d'ajouter plus d'ingrédients ou ajoutez de nouvelles recettes.</p>
          </div>
        ` : `
          <div class="recipe-grid">
            ${matches.map(m => {
              const pct = Math.round(m.score * 100);
              const cat = CATEGORIES.find(c => c.id === m.recipe.category) || { emoji: '✨', label: 'Autre' };
              const img = m.recipe.photo
                ? `<img src="${m.recipe.photo}" alt="" loading="lazy" />`
                : `<div class="placeholder">${cat.emoji}</div>`;
              return `
                <article class="recipe-card" onclick="openRecipe('${m.recipe.id}')">
                  <div class="recipe-card-img">${img}</div>
                  <div class="recipe-card-body">
                    <h3>${escapeHtml(m.recipe.title)}</h3>
                    <div class="match-score">${pct}% des ingrédients ✓</div>
                    <div class="recipe-card-meta">
                      <span class="tag ${m.recipe.category}">${cat.label}</span>
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        `}
      ` : `
        <div class="empty-state">
          <div class="empty-icon">🧊</div>
          <h3>Votre frigo est vide</h3>
          <p>Ajoutez ce que vous avez sous la main pour découvrir des idées de recettes.</p>
        </div>
      `}
    </div>
  `;
}

function bindFridgeView() {
  const input = $('#fridge-input');
  const add = () => {
    const val = input.value.trim();
    if (!val) return;
    // Support comma-separated
    const parts = val.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    parts.forEach(async (p) => {
      const exists = state.fridge.some(f => f.name === p.toLowerCase());
      if (!exists) await addFridgeItem(p);
    });
    input.value = '';
    render();
  };
  $('#btn-add-fridge')?.addEventListener('click', add);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
}

async function removeFridge(id) {
  await removeFridgeItem(id);
  render();
}
async function clearAllFridge() {
  await clearFridge();
  toast('Frigo vidé');
  render();
}

/* ===== MENU / WEEKLY PLANNING ===== */
async function renderMenuView() {
  const weekKey = state.currentWeekKey;
  const dates = getWeekDates(weekKey);
  const menu = state.menu || { weekKey, meals: {} };

  const dayCards = DAYS.map((dayName, i) => {
    const date = dates[i];
    const dateStr = date ? `${date.getDate()}/${date.getMonth() + 1}` : '';
    const mealSlots = MEAL_TYPES.map(mt => {
      const key = `${i}-${mt.id}`;
      const recipeId = menu.meals[key];
      const recipe = recipeId ? state.recipes.find(r => r.id === recipeId) : null;
      return `
        <div class="meal-slot">
          <span class="meal-type">${mt.label}</span>
          ${recipe
            ? `<span class="meal-name" onclick="openRecipe('${recipe.id}')">${escapeHtml(recipe.title)}</span>
               <button class="btn-icon" onclick="clearMeal('${key}')" title="Retirer">×</button>`
            : `<span class="meal-empty">— non planifié —</span>
               <button class="btn-icon" onclick="pickRecipeForMeal('${key}')" title="Choisir">+</button>`
          }
        </div>
      `;
    }).join('');

    return `
      <div class="day-card">
        <div class="day-header">
          <span>${dayName} <span class="text-muted" style="font-weight:400;font-size:0.8rem">${dateStr}</span></span>
        </div>
        <div class="day-meals">${mealSlots}</div>
      </div>
    `;
  }).join('');

  // Shopping list
  const shopping = buildShoppingList(menu);

  return `
    <div class="page">
      <div class="week-nav">
        <button class="icon-btn" onclick="changeWeek(-1)" aria-label="Semaine précédente">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2>Semaine ${weekKey.split('-W')[1]}</h2>
        <button class="icon-btn" onclick="changeWeek(1)" aria-label="Semaine suivante">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="autoFillMenu()">✨ Remplir auto</button>
        <button class="btn btn-ghost btn-sm" onclick="clearWeekMenu()">Tout effacer</button>
      </div>

      ${dayCards}

      <div class="shopping-list mt-16">
        <h3>🛒 Liste de courses</h3>
        ${shopping.length === 0
          ? `<p class="text-muted text-sm">Planifiez des repas pour générer la liste.</p>`
          : shopping.map(group => `
              <div class="shop-cat">${group.cat}</div>
              ${group.items.map(item => `
                <label class="shop-item">
                  <input type="checkbox" onchange="this.parentElement.classList.toggle('checked', this.checked)" />
                  <span>${escapeHtml(item)}</span>
                </label>
              `).join('')}
            `).join('')
        }
      </div>
    </div>
  `;
}

function bindMenuView() {
  // nothing extra needed — handlers are global
}

function changeWeek(delta) {
  // Simple week navigation by adjusting date
  const dates = getWeekDates(state.currentWeekKey);
  const monday = dates[0];
  monday.setDate(monday.getDate() + delta * 7);
  state.currentWeekKey = getWeekKey(monday);
  render();
}

async function pickRecipeForMeal(mealKey) {
  if (!state.recipes.length) {
    toast('Ajoutez d\'abord des recettes');
    return;
  }
  const list = state.recipes.map(r => {
    const cat = CATEGORIES.find(c => c.id === r.category) || { emoji: '✨' };
    const img = r.photo
      ? `<img src="${r.photo}" alt="" />`
      : `<div class="picker-ph">${cat.emoji}</div>`;
    return `
      <div class="picker-item" onclick="assignMeal('${mealKey}', '${r.id}')">
        ${img}
        <div>
          <strong>${escapeHtml(r.title)}</strong>
          <span>${cat.label || r.category}</span>
        </div>
      </div>
    `;
  }).join('');

  openModal(`
    <div class="modal-handle"></div>
    <h2 class="modal-title">Choisir une recette</h2>
    <div class="picker-list">${list}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-block" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

async function assignMeal(mealKey, recipeId) {
  const menu = state.menu || { weekKey: state.currentWeekKey, meals: {} };
  menu.meals[mealKey] = recipeId;
  await saveMenu(menu);
  closeModal();
  render();
}

async function clearMeal(mealKey) {
  const menu = state.menu || { weekKey: state.currentWeekKey, meals: {} };
  delete menu.meals[mealKey];
  await saveMenu(menu);
  render();
}

async function clearWeekMenu() {
  await saveMenu({ weekKey: state.currentWeekKey, meals: {} });
  toast('Semaine effacée');
  render();
}

async function autoFillMenu() {
  if (state.recipes.length < 3) {
    toast('Ajoutez plus de recettes pour le remplissage auto');
    return;
  }
  // Prefer plats for main meals, mix categories
  const plats = state.recipes.filter(r => r.category === 'plat');
  const others = state.recipes.filter(r => r.category !== 'plat');
  const pool = [...plats, ...plats, ...others]; // weight plats
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const menu = { weekKey: state.currentWeekKey, meals: {} };
  let idx = 0;
  for (let d = 0; d < 7; d++) {
    for (const mt of MEAL_TYPES) {
      if (shuffled[idx]) {
        menu.meals[`${d}-${mt.id}`] = shuffled[idx % shuffled.length].id;
        idx++;
      }
    }
  }
  await saveMenu(menu);
  toast('Menu généré ✨');
  render();
}

function buildShoppingList(menu) {
  if (!menu?.meals) return [];
  const allIngs = [];
  Object.values(menu.meals).forEach(rid => {
    const r = state.recipes.find(x => x.id === rid);
    if (r?.ingredients) {
      r.ingredients.forEach(ing => {
        const name = typeof ing === 'string' ? ing : (ing.qty ? `${ing.qty} ${ing.name}` : ing.name);
        if (name) allIngs.push(name);
      });
    }
  });
  // Dedupe roughly
  const seen = new Set();
  const unique = [];
  allIngs.forEach(ing => {
    const key = normalize(ing);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ing);
    }
  });
  // Group loosely by first word / category heuristic
  if (!unique.length) return [];
  return [{ cat: 'Ingrédients à acheter', items: unique.sort((a, b) => a.localeCompare(b, 'fr')) }];
}

/* ===== Helpers ===== */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

/* ===== Init ===== */
async function init() {
  await openDB();
  await loadData();
  // Seed demo recipe if empty
  if (state.recipes.length === 0) {
    await saveRecipe({
      title: 'Pâtes à la tomate express',
      category: 'plat',
      prepTime: '20 min',
      servings: '2',
      source: 'Exemple',
      ingredients: ['200 g de pâtes', '2 tomates', '1 gousse d\'ail', 'Huile d\'olive', 'Sel, poivre', 'Basilic frais'],
      steps: [
        'Faire bouillir une grande casserole d\'eau salée et cuire les pâtes selon le paquet.',
        'Pendant ce temps, couper les tomates en dés et émincer l\'ail.',
        'Faire revenir l\'ail dans un filet d\'huile d\'olive, ajouter les tomates, saler, poivrer. Laisser mijoter 8–10 min.',
        'Égoutter les pâtes, les mélanger à la sauce. Parsemer de basilic et servir.'
      ],
      notes: 'Vous pouvez ajouter du parmesan râpé et un peu de piment.'
    });
    await loadData();
  }
  render();
  showInstallBanner();
}

// Expose functions used in inline HTML handlers
window.setView = setView;
window.openRecipe = openRecipe;
window.filterCategory = filterCategory;
window.confirmDelete = confirmDelete;
window.doDelete = doDelete;
window.removeIngRow = removeIngRow;
window.removeStepRow = removeStepRow;
window.removeFridge = removeFridge;
window.clearAllFridge = clearAllFridge;
window.changeWeek = changeWeek;
window.pickRecipeForMeal = pickRecipeForMeal;
window.assignMeal = assignMeal;
window.clearMeal = clearMeal;
window.clearWeekMenu = clearWeekMenu;
window.autoFillMenu = autoFillMenu;
window.closeModal = closeModal;
window.showInstallHelp = showInstallHelp;
window.state = state;

init().catch(err => {
  console.error(err);
  $('#main').innerHTML = `<div class="page"><div class="empty-state"><h3>Erreur de chargement</h3><p>${err.message}</p></div></div>`;
});
