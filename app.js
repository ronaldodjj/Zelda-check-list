(() => {
  "use strict";

  const LS_STATE = "zc.state.v1";
  const LS_CUSTOM_GAMES = "zc.customGames.v1";
  const LS_CUSTOM_CATEGORIES = "zc.customCategories.v1";
  const LS_SELECTED_GAME = "zc.selectedGame.v1";
  const LS_COLLAPSED = "zc.collapsed.v1";
  const LS_THEME = "zc.theme.v1";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("No se pudo leer", key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("No se pudo guardar", key, e);
      toast("No se pudo guardar (almacenamiento lleno o bloqueado)");
    }
  }

  // ---------- State ----------
  let state = loadJSON(LS_STATE, {}); // { [gameId]: { [key]: true } }
  let customGames = loadJSON(LS_CUSTOM_GAMES, []); // [{id,name,subtitle,color,categories:[]}]
  let customCategories = loadJSON(LS_CUSTOM_CATEGORIES, {}); // { [gameId]: [category,...] }
  let collapsed = loadJSON(LS_COLLAPSED, {}); // { [gameId+catId]: true }
  let selectedGameId = localStorage.getItem(LS_SELECTED_GAME) || null;
  let searchTerm = "";

  function allGames() {
    return [...window.ZELDA_GAMES, ...customGames];
  }

  function getGame(id) {
    return allGames().find((g) => g.id === id);
  }

  function getCategories(game) {
    const extra = customCategories[game.id] || [];
    return [...game.categories, ...extra];
  }

  function itemKeysForCategory(cat) {
    if (cat.type === "grid") {
      const keys = [];
      for (let i = 1; i <= cat.count; i++) keys.push(`${cat.id}:${i}`);
      return keys;
    }
    return cat.items.map((it) => it.id);
  }

  function gameStats(game) {
    const cats = getCategories(game);
    const gState = state[game.id] || {};
    let total = 0;
    let checked = 0;
    const perCat = {};
    for (const cat of cats) {
      const keys = itemKeysForCategory(cat);
      const done = keys.filter((k) => gState[k]).length;
      perCat[cat.id] = { total: keys.length, done };
      total += keys.length;
      checked += done;
    }
    return { total, checked, perCat, pct: total ? Math.round((checked / total) * 1000) / 10 : 0 };
  }

  function isChecked(gameId, key) {
    return !!(state[gameId] && state[gameId][key]);
  }

  function setChecked(gameId, key, value) {
    if (!state[gameId]) state[gameId] = {};
    if (value) state[gameId][key] = true;
    else delete state[gameId][key];
    saveJSON(LS_STATE, state);
  }

  // ---------- Rendering ----------
  const root = $("#app");

  function render() {
    const games = allGames();
    if (!selectedGameId || !getGame(selectedGameId)) {
      selectedGameId = games[0].id;
    }
    const game = getGame(selectedGameId);
    document.documentElement.style.setProperty("--game-color", game.color || "#d4af37");

    renderTabs(games, game);
    renderHero(game);
    renderCategories(game);
  }

  function renderTabs(games, activeGame) {
    const wrap = $("#gameTabs");
    wrap.innerHTML = "";
    for (const g of games) {
      const btn = document.createElement("button");
      btn.className = "game-tab" + (g.id === activeGame.id ? " active" : "");
      btn.textContent = g.name;
      btn.style.background = g.id === activeGame.id ? (g.color || "#d4af37") : "";
      btn.addEventListener("click", () => {
        selectedGameId = g.id;
        localStorage.setItem(LS_SELECTED_GAME, g.id);
        searchTerm = "";
        $("#searchInput").value = "";
        render();
      });
      wrap.appendChild(btn);
    }
    const addBtn = document.createElement("button");
    addBtn.className = "game-tab add-tab";
    addBtn.textContent = "+ Juego";
    addBtn.addEventListener("click", openAddGameModal);
    wrap.appendChild(addBtn);
  }

  function renderHero(game) {
    const stats = gameStats(game);
    $("#heroTitle").textContent = game.name;
    $("#heroSubtitle").textContent = game.subtitle || "";
    $("#heroCount").textContent = `${stats.checked} / ${stats.total} completados`;

    const circumference = 2 * Math.PI * 36;
    const offset = circumference - (stats.pct / 100) * circumference;
    $("#ringBar").setAttribute("stroke-dasharray", `${circumference} ${circumference}`);
    $("#ringBar").setAttribute("stroke-dashoffset", String(offset));
    $("#ringLabel").textContent = `${stats.pct}%`;

    if (stats.total > 0 && stats.checked === stats.total) {
      showCelebration();
    }
  }

  let celebrated = {};
  function showCelebration() {
    if (celebrated[selectedGameId]) return;
    celebrated[selectedGameId] = true;
    toast("¡100% completado! 🎉");
  }

  function renderCategories(game) {
    const cats = getCategories(game);
    const term = searchTerm.trim().toLowerCase();
    const container = $("#categories");
    container.innerHTML = "";

    let anyVisible = false;

    for (const cat of cats) {
      const isCustomCat = (customCategories[game.id] || []).some((c) => c.id === cat.id);
      let items = null;
      let gridCount = null;

      if (cat.type === "grid") {
        gridCount = cat.count;
        if (term && !cat.name.toLowerCase().includes(term)) continue;
      } else {
        items = term
          ? cat.items.filter((it) => it.name.toLowerCase().includes(term))
          : cat.items;
        if (term && items.length === 0) continue;
      }

      anyVisible = true;
      const gState = state[game.id] || {};
      const keys = itemKeysForCategory(cat);
      const done = keys.filter((k) => gState[k]).length;
      const pct = keys.length ? Math.round((done / keys.length) * 100) : 0;

      const card = document.createElement("div");
      const collapseKey = `${game.id}:${cat.id}`;
      const isCollapsed = !!collapsed[collapseKey] && !term;
      card.className = "category-card" + (isCollapsed ? " collapsed" : "");
      card.dataset.catId = cat.id;

      const header = document.createElement("div");
      header.className = "category-header";
      header.innerHTML = `
        <div class="category-icon">${cat.icon || "🔹"}</div>
        <div class="category-title">
          <h3>${escapeHTML(cat.name)}</h3>
          ${cat.note ? `<div class="cat-note">${escapeHTML(cat.note)}</div>` : ""}
        </div>
        <div class="category-manage">
          ${isCustomCat ? `<button class="tiny-btn" data-action="delete-category" title="Eliminar categoría">🗑️</button>` : ""}
        </div>
        <div class="category-count">${done}/${keys.length}</div>
        <svg class="category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      `;
      header.addEventListener("click", (e) => {
        if (e.target.closest('[data-action="delete-category"]')) return;
        collapsed[collapseKey] = !isCollapsed;
        saveJSON(LS_COLLAPSED, collapsed);
        card.classList.toggle("collapsed");
      });
      card.appendChild(header);

      const delBtn = header.querySelector('[data-action="delete-category"]');
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          confirmModal(`¿Eliminar la categoría "${cat.name}"? Se perderá el progreso guardado en ella.`, () => {
            customCategories[game.id] = (customCategories[game.id] || []).filter((c) => c.id !== cat.id);
            saveJSON(LS_CUSTOM_CATEGORIES, customCategories);
            if (state[game.id]) {
              for (const k of keys) delete state[game.id][k];
              saveJSON(LS_STATE, state);
            }
            render();
          });
        });
      }

      const miniBar = document.createElement("div");
      miniBar.className = "mini-bar";
      miniBar.innerHTML = `<div class="mini-bar-fill" style="width:${pct}%"></div>`;
      card.appendChild(miniBar);

      const body = document.createElement("div");
      body.className = "category-body";

      if (cat.type === "grid") {
        const gridWrap = document.createElement("div");
        gridWrap.className = "grid-wrap";
        for (let i = 1; i <= gridCount; i++) {
          const key = `${cat.id}:${i}`;
          const cell = document.createElement("button");
          cell.className = "grid-cell" + (gState[key] ? " checked" : "");
          cell.textContent = String(i);
          cell.dataset.key = key;
          cell.dataset.gameId = game.id;
          cell.type = "button";
          gridWrap.appendChild(cell);
        }
        body.appendChild(gridWrap);
      } else {
        for (const it of items) {
          const row = document.createElement("div");
          const checked = !!gState[it.id];
          row.className = "item-row" + (checked ? " checked" : "");
          row.dataset.key = it.id;
          row.dataset.gameId = game.id;
          row.innerHTML = `
            <div class="checkbox">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="${checked ? "#fff" : "currentColor"}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="item-label">${escapeHTML(it.name)}</div>
          `;
          body.appendChild(row);
        }
      }

      card.appendChild(body);
      container.appendChild(card);
    }

    const empty = $("#emptyState");
    empty.style.display = anyVisible ? "none" : "block";
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Interaction ----------
  $("#categories").addEventListener("click", (e) => {
    const row = e.target.closest(".item-row");
    const cell = e.target.closest(".grid-cell");
    const target = row || cell;
    if (!target) return;
    const gameId = target.dataset.gameId;
    const key = target.dataset.key;
    const newValue = !isChecked(gameId, key);
    setChecked(gameId, key, newValue);
    if (navigator.vibrate) navigator.vibrate(newValue ? 12 : 6);
    render();
  });

  $("#searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderCategories(getGame(selectedGameId));
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // ---------- Confirm modal (generic) ----------
  function confirmModal(message, onConfirm) {
    const backdrop = $("#genericModal");
    $("#genericModalBody").innerHTML = `<p style="color:var(--text-dim);font-size:0.88rem;line-height:1.5;">${escapeHTML(message)}</p>`;
    $("#genericModalTitle").textContent = "Confirmar";
    const actions = $("#genericModalActions");
    actions.innerHTML = "";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", closeGenericModal);
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primary";
    okBtn.textContent = "Eliminar";
    okBtn.addEventListener("click", () => {
      closeGenericModal();
      onConfirm();
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    backdrop.classList.add("open");
  }

  function closeGenericModal() {
    $("#genericModal").classList.remove("open");
  }

  $("#genericModal").addEventListener("click", (e) => {
    if (e.target.id === "genericModal") closeGenericModal();
  });

  // ---------- Reset progress ----------
  $("#resetBtn").addEventListener("click", () => {
    const game = getGame(selectedGameId);
    confirmModalCustom(
      `Reiniciar progreso de "${game.name}"`,
      `Esto desmarcará todos los elementos de ${game.name}. Esta acción no se puede deshacer.`,
      "Reiniciar",
      () => {
        state[game.id] = {};
        saveJSON(LS_STATE, state);
        celebrated[game.id] = false;
        render();
        toast("Progreso reiniciado");
      }
    );
  });

  function confirmModalCustom(title, message, confirmLabel, onConfirm) {
    const backdrop = $("#genericModal");
    $("#genericModalTitle").textContent = title;
    $("#genericModalBody").innerHTML = `<p style="color:var(--text-dim);font-size:0.88rem;line-height:1.5;">${escapeHTML(message)}</p>`;
    const actions = $("#genericModalActions");
    actions.innerHTML = "";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", closeGenericModal);
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primary";
    okBtn.textContent = confirmLabel;
    okBtn.addEventListener("click", () => {
      closeGenericModal();
      onConfirm();
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    backdrop.classList.add("open");
  }

  // ---------- Export / Import ----------
  $("#exportBtn").addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      state,
      customGames,
      customCategories,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zelda-checklist-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Copia de seguridad descargada");
  });

  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.state) state = data.state;
      if (data.customGames) customGames = data.customGames;
      if (data.customCategories) customCategories = data.customCategories;
      saveJSON(LS_STATE, state);
      saveJSON(LS_CUSTOM_GAMES, customGames);
      saveJSON(LS_CUSTOM_CATEGORIES, customCategories);
      render();
      toast("Datos importados correctamente");
    } catch (err) {
      toast("Archivo inválido");
    }
    e.target.value = "";
  });

  // ---------- Add custom game ----------
  function openAddGameModal() {
    const backdrop = $("#genericModal");
    $("#genericModalTitle").textContent = "Nuevo juego";
    $("#genericModalBody").innerHTML = `
      <label>Nombre del juego</label>
      <input type="text" id="newGameName" placeholder="Ej: Breath of the Wild" />
      <label>Subtítulo (opcional)</label>
      <input type="text" id="newGameSubtitle" placeholder="Ej: Nintendo Switch" />
      <label>Color de acento</label>
      <input type="text" id="newGameColor" placeholder="#2d6a4f" value="#4a6fa5" />
    `;
    const actions = $("#genericModalActions");
    actions.innerHTML = "";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", closeGenericModal);
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primary";
    okBtn.textContent = "Crear";
    okBtn.addEventListener("click", () => {
      const name = $("#newGameName").value.trim();
      if (!name) { toast("Escribe un nombre"); return; }
      const id = "custom-" + slugify(name) + "-" + Date.now().toString(36);
      const subtitle = $("#newGameSubtitle").value.trim();
      const color = $("#newGameColor").value.trim() || "#4a6fa5";
      customGames.push({ id, name, subtitle, color, categories: [] });
      saveJSON(LS_CUSTOM_GAMES, customGames);
      selectedGameId = id;
      localStorage.setItem(LS_SELECTED_GAME, id);
      closeGenericModal();
      render();
      toast(`Juego "${name}" creado`);
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    backdrop.classList.add("open");
  }

  // ---------- Add custom category ----------
  $("#addCategoryBtn").addEventListener("click", () => {
    const backdrop = $("#genericModal");
    $("#genericModalTitle").textContent = "Nueva categoría";
    $("#genericModalBody").innerHTML = `
      <label>Nombre de la categoría</label>
      <input type="text" id="newCatName" placeholder="Ej: Santuarios" />
      <label>Icono (un emoji)</label>
      <input type="text" id="newCatIcon" placeholder="⭐" value="⭐" />
      <label>Tipo</label>
      <select id="newCatType">
        <option value="list">Lista de objetos con nombre</option>
        <option value="grid">Cuadrícula numerada (ej: coleccionables)</option>
      </select>
      <div id="newCatListFields">
        <label>Elementos (uno por línea)</label>
        <textarea id="newCatItems" placeholder="Objeto 1\nObjeto 2\nObjeto 3"></textarea>
      </div>
      <div id="newCatGridFields" style="display:none;">
        <label>Cantidad total</label>
        <input type="text" id="newCatCount" placeholder="Ej: 120" inputmode="numeric" />
      </div>
    `;
    $("#newCatType").addEventListener("change", (e) => {
      const isGrid = e.target.value === "grid";
      $("#newCatListFields").style.display = isGrid ? "none" : "block";
      $("#newCatGridFields").style.display = isGrid ? "block" : "none";
    });
    const actions = $("#genericModalActions");
    actions.innerHTML = "";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", closeGenericModal);
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primary";
    okBtn.textContent = "Crear";
    okBtn.addEventListener("click", () => {
      const name = $("#newCatName").value.trim();
      if (!name) { toast("Escribe un nombre"); return; }
      const icon = $("#newCatIcon").value.trim() || "⭐";
      const type = $("#newCatType").value;
      const id = "cc-" + slugify(name) + "-" + Date.now().toString(36);
      let cat;
      if (type === "grid") {
        const count = parseInt($("#newCatCount").value, 10);
        if (!count || count < 1) { toast("Escribe una cantidad válida"); return; }
        cat = { id, name, icon, type: "grid", count };
      } else {
        const lines = $("#newCatItems").value.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) { toast("Añade al menos un elemento"); return; }
        cat = {
          id, name, icon, type: "list",
          items: lines.map((line, i) => ({ id: `${id}-item-${i}`, name: line })),
        };
      }
      if (!customCategories[selectedGameId]) customCategories[selectedGameId] = [];
      customCategories[selectedGameId].push(cat);
      saveJSON(LS_CUSTOM_CATEGORIES, customCategories);
      closeGenericModal();
      render();
      toast(`Categoría "${name}" añadida`);
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    backdrop.classList.add("open");
  });

  function slugify(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
  let currentTheme = localStorage.getItem(LS_THEME) || "auto";
  applyTheme(currentTheme);

  $("#themeBtn").addEventListener("click", () => {
    const order = ["auto", "dark", "light"];
    const idx = (order.indexOf(currentTheme) + 1) % order.length;
    currentTheme = order[idx];
    localStorage.setItem(LS_THEME, currentTheme);
    applyTheme(currentTheme);
    toast(
      currentTheme === "auto"
        ? "Tema: automático"
        : currentTheme === "dark"
        ? "Tema: oscuro"
        : "Tema: claro"
    );
  });

  // ---------- PWA install ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("#installBtn").style.display = "inline-flex";
  });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#installBtn").style.display = "none";
  });
  window.addEventListener("appinstalled", () => {
    $("#installBtn").style.display = "none";
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ---------- Init ----------
  render();
})();
