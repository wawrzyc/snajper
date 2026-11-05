const statusLabels = {
  scheduled: "zaplanowana",
  fired: "strzał padł",
  won: "wygrana",
  lost: "przegrana",
  error: "błąd — nie złożono oferty",
  cancelled: "anulowana",
};

// Logowanie do panelu jest na razie wyłączone — zob. backend/src/index.ts.

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

const mainView = document.getElementById("mainView");

function showMain() {
  mainView.hidden = false;
  setupBookmarklet();
  refreshAll();
}

// --- Bookmarklet ---

function buildBookmarklet(apiBase, token) {
  var src = [
    "(function(){",
    "try {",
    "var scripts = document.querySelectorAll('script[type=\"application/ld+json\"]');",
    "var endTime = null, title = null, price = null;",
    "for (var i = 0; i < scripts.length; i++) {",
    "  try {",
    "    var data = JSON.parse(scripts[i].textContent);",
    "    var items = Array.isArray(data) ? data : [data];",
    "    for (var j = 0; j < items.length; j++) {",
    "      var it = items[j];",
    "      var offers = it && it.offers;",
    "      if (offers && offers.priceValidUntil) {",
    "        endTime = offers.priceValidUntil;",
    "        title = it.name || title;",
    "        price = offers.price || price;",
    "      }",
    "    }",
    "  } catch (e) {}",
    "}",
    "var m = location.href.match(/(\\d{6,})(?:[\\/?#]|$)/);",
    "var offerId = m ? m[1] : null;",
    "if (title) { title = title.replace(/\\\\u([0-9a-fA-F]{4})/g, function(_, h){ return String.fromCharCode(parseInt(h,16)); }); }",
    "if (!endTime || !offerId) { alert('Snajper: nie znalazłem danych aukcji na tej stronie.'); return; }",
    "var maxAmount = prompt('Dodaję: ' + (title || offerId) + '\\nKoniec: ' + endTime + '\\nAktualna cena: ' + (price || '?') + ' zł\\n\\nMaksymalna kwota (zł, musi być WYŻSZA niż aktualna cena):', price || '');",
    "if (!maxAmount) return;",
    "fetch('" + apiBase + "/api/bookmarklet/add', {",
    "  method: 'POST',",
    "  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer " + token + "' },",
    "  body: JSON.stringify({ url: location.href, title: title, endTime: endTime, maxAmount: Number(maxAmount), knownPrice: price ? Number(price) : null })",
    "}).then(function(r){ return r.json(); }).then(function(data){",
    "  alert(data.error ? ('Błąd: ' + data.error) : 'Dodano do Snajpera!');",
    "}).catch(function(err){ alert('Błąd połączenia: ' + err.message); });",
    "} catch (e) { alert('Błąd: ' + e.message); }",
    "})();",
  ].join("\n");
  return "javascript:" + encodeURIComponent(src);
}

async function setupBookmarklet() {
  try {
    const { token } = await api("/settings/bookmarklet-token");
    const link = document.getElementById("bookmarkletLink");
    link.href = buildBookmarklet(window.location.origin, token);
  } catch {
    // panel i tak działa bez tego — bookmarklet to tylko wygoda
  }
}

// --- Allegro connect ---

function updateAllegroStatusPill(status) {
  const pill = document.getElementById("allegroStatusPill");
  if (status.connected) {
    pill.textContent = "🟢 Połączono z Allegro";
    pill.className = "status-pill status-pill-ok";
  } else if (status.pending) {
    pill.textContent = "🟡 Oczekiwanie na autoryzację";
    pill.className = "status-pill status-pill-pending";
  } else if (!status.configured) {
    pill.textContent = "⚪ Nieskonfigurowane";
    pill.className = "status-pill status-pill-unknown";
  } else {
    pill.textContent = "🔴 Niepołączone";
    pill.className = "status-pill status-pill-bad";
  }
}

async function refreshAllegroStatus() {
  const status = await api("/allegro/status");
  const banner = document.getElementById("allegroBanner");
  const bannerText = document.getElementById("allegroBannerText");
  const connectBtn = document.getElementById("connectAllegroBtn");

  updateAllegroStatusPill(status);

  banner.hidden = status.connected;
  if (!status.connected) {
    if (!status.configured) {
      bannerText.textContent = "Najpierw uzupełnij dane aplikacji Allegro w ustawieniach (⚙️ w prawym górnym rogu).";
      connectBtn.hidden = true;
    } else {
      bannerText.textContent = "Allegro nie jest połączone.";
      connectBtn.hidden = false;
    }
  }

  if (status.pending) {
    document.getElementById("deviceCodeBox").hidden = false;
  } else if (!status.connected) {
    document.getElementById("deviceCodeBox").hidden = true;
  }
  const errorEl = document.getElementById("allegroError");
  if (status.error) {
    errorEl.textContent = "Błąd autoryzacji Allegro: " + status.error;
    errorEl.hidden = false;
  }

  const clockEl = document.getElementById("clockInfo");
  if (status.clock) {
    if (!status.clock.lastSyncAt) {
      clockEl.textContent = "Jeszcze nie zsynchronizowano (połącz się z Allegro, żeby sprawdzić).";
    } else {
      const offsetS = Math.round(status.clock.offsetMs / 1000);
      const sign = offsetS >= 0 ? "+" : "";
      const warn = Math.abs(offsetS) >= 3 ? " ⚠️ to dużo jak na snajpera — sprawdź zegar systemowy Windows." : " ✓ OK";
      clockEl.textContent = `Przesunięcie: ${sign}${offsetS}s (ostatnia synchronizacja: ${fmtDate(status.clock.lastSyncAt)}).${warn}`;
    }
  }
  return status;
}

// --- Modal ustawień ---

const settingsModal = document.getElementById("settingsModal");

document.getElementById("openSettingsBtn").addEventListener("click", () => {
  settingsModal.hidden = false;
  loadAllegroAppSettings();
});

document.getElementById("closeSettingsBtn").addEventListener("click", () => {
  settingsModal.hidden = true;
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.hidden = true;
});

async function loadAllegroAppSettings() {
  try {
    const app = await api("/settings/allegro-app");
    document.getElementById("allegroClientId").value = app.clientId;
    document.getElementById("allegroSandbox").checked = app.sandbox;
  } catch {
    // panel i tak działa, po prostu pokaże puste pola
  }
}

document.getElementById("allegroAppForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("allegroAppStatus");
  const errorEl = document.getElementById("allegroAppError");
  statusEl.hidden = true;
  errorEl.hidden = true;
  const payload = {
    clientId: document.getElementById("allegroClientId").value,
    clientSecret: document.getElementById("allegroClientSecret").value,
    sandbox: document.getElementById("allegroSandbox").checked,
  };
  try {
    await api("/settings/allegro-app", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("allegroClientSecret").value = "";
    statusEl.textContent = "Zapisano. Zamknij to okno i kliknij „Połącz z Allegro”.";
    statusEl.hidden = false;
    refreshAllegroStatus();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById("connectAllegroBtn").addEventListener("click", async () => {
  const errorEl = document.getElementById("allegroError");
  errorEl.hidden = true;
  try {
    const data = await api("/allegro/connect", { method: "POST" });
    const box = document.getElementById("deviceCodeBox");
    const link = document.getElementById("deviceCodeLink");
    link.href = data.verificationUri;
    link.textContent = data.verificationUri;
    document.getElementById("deviceCodeValue").textContent = data.userCode;
    box.hidden = false;
  } catch (err) {
    errorEl.textContent = "Błąd: " + err.message;
    errorEl.hidden = false;
  }
});

// --- Watches ---

let lastWatches = [];
let editingWatchId = null;

const editWatchModal = document.getElementById("editWatchModal");

function startEditWatch(watch) {
  editingWatchId = watch.id;
  document.getElementById("editWatchInfo").innerHTML =
    `<strong>${escapeHtml(watch.title)}</strong><br>Koniec aukcji: ${fmtDate(watch.endTime)}` +
    (watch.currentPrice != null ? `<br>Ostatnia znana cena: ${watch.currentPrice.toFixed(2)} zł` : "");
  document.getElementById("editMaxAmount").value = watch.maxAmount;
  document.getElementById("editOffset").value = watch.snipeOffsetSeconds;
  document.getElementById("editWatchError").hidden = true;
  editWatchModal.hidden = false;
}

function stopEditWatch() {
  editingWatchId = null;
  editWatchModal.hidden = true;
}

document.getElementById("closeEditBtn").addEventListener("click", stopEditWatch);
editWatchModal.addEventListener("click", (e) => {
  if (e.target === editWatchModal) stopEditWatch();
});

document.getElementById("editWatchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("editWatchError");
  errorEl.hidden = true;
  const payload = {
    maxAmount: Number(document.getElementById("editMaxAmount").value),
    snipeOffsetSeconds: Number(document.getElementById("editOffset").value),
  };
  try {
    await api(`/watches/${editingWatchId}`, { method: "PATCH", body: JSON.stringify(payload) });
    stopEditWatch();
    refreshWatches();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

function fmtDate(iso) {
  return new Date(iso).toLocaleString("pl-PL");
}

function formatCountdown(ms) {
  if (ms <= 0) return "zakończona";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days >= 1) return `${days} dni i ${hours} godz.`;
  if (hours >= 1) return `${hours} godz. i ${minutes} min.`;
  if (minutes >= 1) return `${minutes} min. i ${seconds} s.`;
  return `${seconds} s.`;
}

function updateCountdowns() {
  document.querySelectorAll(".countdown[data-end]").forEach((el) => {
    const remaining = new Date(el.dataset.end).getTime() - Date.now();
    el.textContent = formatCountdown(remaining);
    el.classList.toggle("countdown-urgent", remaining > 0 && remaining < 5 * 60_000);
  });
}

setInterval(updateCountdowns, 1000);

function renderWatches(watches) {
  const list = document.getElementById("watchList");
  list.innerHTML = "";
  lastWatches = watches;
  if (watches.length === 0) {
    list.innerHTML = '<li class="muted">Brak zaplanowanych licytacji.</li>';
    return;
  }
  for (const w of watches) {
    const li = document.createElement("li");
    const timeInfo =
      w.status === "scheduled"
        ? `do końca: <span class="countdown" data-end="${w.endTime}"></span> (${fmtDate(w.endTime)})`
        : `koniec: ${fmtDate(w.endTime)}`;
    li.innerHTML = `
      <div class="row">
        <span class="title">${escapeHtml(w.title)}</span>
        <span class="status status-${w.status}">${statusLabels[w.status] ?? w.status}</span>
      </div>
      <div class="meta">Max: ${w.maxAmount.toFixed(2)} zł · ${timeInfo} · strzał ${w.snipeOffsetSeconds}s przed</div>
      ${w.currentPrice != null ? `<div class="meta">Ostatnia znana cena: ${w.currentPrice.toFixed(2)} zł</div>` : ""}
      ${w.lastError ? `<div class="error">${escapeHtml(w.lastError)}</div>` : ""}
      <div class="actions">
        <a href="${w.url}" target="_blank" rel="noopener"><button type="button">Zobacz</button></a>
        ${w.status === "scheduled" ? `<button type="button" data-id="${w.id}" data-action="edit">Edytuj</button>` : ""}
        <button type="button" class="btn-danger" data-id="${w.id}" data-action="delete">Usuń</button>
      </div>
    `;
    list.appendChild(li);
  }
  list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const watch = lastWatches.find((w) => w.id === btn.dataset.id);
      if (watch) startEditWatch(watch);
    });
  });
  list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/watches/${btn.dataset.id}`, { method: "DELETE" });
      refreshWatches();
    });
  });
  updateCountdowns();
}

function renderHistory(history) {
  const list = document.getElementById("historyList");
  list.innerHTML = "";
  if (history.length === 0) {
    list.innerHTML = '<li class="muted">Brak historii.</li>';
    return;
  }
  for (const h of history.slice(0, 30)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="row">
        <span class="title">${escapeHtml(h.title)}</span>
        <span class="status status-${h.status}">${statusLabels[h.status] ?? h.status}</span>
      </div>
      <div class="meta">${fmtDate(h.createdAt)} ${h.amount != null ? `· ${h.amount.toFixed(2)} zł` : ""}</div>
      <div class="meta">${escapeHtml(h.message)}</div>
    `;
    list.appendChild(li);
  }
}

async function refreshWatches() {
  const watches = await api("/watches");
  renderWatches(watches);
}

async function refreshHistory() {
  const history = await api("/watches/history");
  renderHistory(history);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("addWatchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("addWatchError");
  errorEl.hidden = true;
  const payload = {
    url: document.getElementById("watchUrl").value,
    title: document.getElementById("watchTitle").value,
    maxAmount: Number(document.getElementById("watchMaxAmount").value),
    endTime: new Date(document.getElementById("watchEndTime").value).toISOString(),
    snipeOffsetSeconds: Number(document.getElementById("watchOffset").value),
  };
  try {
    await api("/watches", { method: "POST", body: JSON.stringify(payload) });
    e.target.reset();
    document.getElementById("watchOffset").value = 7;
    refreshWatches();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

async function refreshAll() {
  try {
    await refreshAllegroStatus();
    await refreshWatches();
    await refreshHistory();
  } catch {
    // spróbujemy ponownie przy kolejnym ticku
  }
}

setInterval(refreshAll, 5000);

// --- Start ---

showMain();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
