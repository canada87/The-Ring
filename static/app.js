const CIRCUMFERENCE = 2 * Math.PI * 88;
const POLL_MS = 30000;
const TICK_MS = 1000;
const TOAST_MS = 5000;
const UNDO_TOAST_MS = 6000;

const el = (id) => document.getElementById(id);

const state = {
  status: null,
  loaded: false,
  offline: false,
  busy: false,
  emailConfigured: false,
  view: null,
  settingsDirty: false,
};

// Skip redundant writes so live regions don't re-announce unchanged text.
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function jsonRequest(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Resolves with the parsed body, rejects with an Error carrying a user-facing message.
async function api(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Connessione al server assente.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Errore del server.");
  }
  return res.json();
}

// ---------- Toast ----------

let toastTimer = null;

function hideToast() {
  clearTimeout(toastTimer);
  el("toast").classList.add("hidden");
}

function showToast(message, { kind = "info", actionLabel, onAction, duration = TOAST_MS } = {}) {
  const action = el("toast-action");
  clearTimeout(toastTimer);
  el("toast-message").textContent = message;
  el("toast").classList.toggle("error", kind === "error");
  if (actionLabel && onAction) {
    action.textContent = actionLabel;
    action.classList.remove("hidden");
    action.onclick = () => {
      hideToast();
      onAction();
    };
  } else {
    action.classList.add("hidden");
    action.onclick = null;
  }
  el("toast").classList.remove("hidden");
  toastTimer = setTimeout(hideToast, duration);
}

function setBusy(busy) {
  state.busy = busy;
  document.querySelectorAll("#action-btn, #setup-submit").forEach((b) => {
    b.disabled = busy;
  });
}

// ---------- Navigation ----------

function switchView(name, { focus = false } = {}) {
  // Leaving the settings with edits that were never saved: save them instead of dropping them.
  if (state.view === "settings" && name !== "settings" && state.settingsDirty) {
    saveSettings().then((ok) =>
      showToast(ok ? "Impostazioni salvate." : "Modifiche alle impostazioni non salvate.", {
        kind: ok ? "info" : "error",
      })
    );
  }
  state.view = name;
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.remove("active");
    b.removeAttribute("aria-current");
  });
  el(`view-${name}`).classList.remove("hidden");
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  btn.classList.add("active");
  btn.setAttribute("aria-current", "page");
  if (focus) {
    window.scrollTo(0, 0);
    el(`title-${name}`).focus({ preventScroll: true });
  }
  if (name === "history") loadHistory();
  if (name === "settings") loadSettings();
}

// Each view has its own URL hash, so deep links work and Back steps through the views.
const VIEW_HASHES = { dashboard: "dashboard", history: "storico", settings: "impostazioni" };

function viewFromHash() {
  const hash = location.hash.slice(1);
  return Object.keys(VIEW_HASHES).find((name) => VIEW_HASHES[name] === hash) || "dashboard";
}

function navigate(name) {
  const hash = `#${VIEW_HASHES[name]}`;
  if (location.hash === hash) {
    switchView(name, { focus: true });
  } else {
    location.hash = hash;
  }
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.view));
});

window.addEventListener("hashchange", () => switchView(viewFromHash(), { focus: true }));

// ---------- Dashboard ----------

function showLoadCard(message, { retry = false } = {}) {
  el("load-card").classList.remove("hidden");
  el("setup-card").classList.add("hidden");
  el("dashboard-card").classList.add("hidden");
  el("load-message").textContent = message;
  el("load-retry").classList.toggle("hidden", !retry);
}

async function fetchStatus() {
  try {
    state.status = await api("/api/status");
    state.loaded = true;
    state.offline = false;
    renderDashboard();
  } catch (e) {
    if (!state.loaded) {
      showLoadCard("Impossibile contattare il server.", { retry: true });
    } else if (!state.offline) {
      state.offline = true;
      showToast("Connessione assente: i dati potrebbero non essere aggiornati.", {
        kind: "error",
      });
    }
  }
}

el("load-retry").addEventListener("click", () => {
  showLoadCard("Caricamento…");
  fetchStatus();
});

function renderDashboard() {
  const s = state.status;
  const setupCard = el("setup-card");
  const dashCard = el("dashboard-card");
  el("load-card").classList.add("hidden");

  if (!s || s.phase === "setup_required") {
    setupCard.classList.remove("hidden");
    dashCard.classList.add("hidden");
    if (s && s.wear_days) {
      setText(
        el("setup-cycle"),
        `Il ciclo dura ${s.wear_days + s.rest_days} giorni: ${s.wear_days} con l'anello inserito, poi ${s.rest_days} di pausa.`
      );
    }
    return;
  }

  setupCard.classList.add("hidden");
  dashCard.classList.remove("hidden");
  tickDashboard();
}

function tickDashboard() {
  const s = state.status;
  if (!s || s.phase === "setup_required" || document.hidden) return;

  const now = new Date();
  const started = new Date(s.cycle_started_at);
  const due = new Date(s.due_at);
  const totalMs = due - started;
  const elapsedMs = now - started;
  const remainingMs = due - now;
  const overtime = remainingMs <= 0;

  const ringWrap = document.querySelector(".ring-wrap");
  ringWrap.classList.toggle("overtime", overtime);

  const fraction = overtime ? 1 : Math.min(1, Math.max(0, elapsedMs / totalMs));
  const offset = CIRCUMFERENCE * (1 - fraction);
  el("progress-ring__value").style.strokeDashoffset = offset;

  const actionLabel =
    s.next_action === "remove" ? "togliere l'anello" : "inserire il nuovo anello";

  const banner = el("overtime-banner");
  if (overtime) {
    banner.classList.remove("hidden");
    setText(banner, `In ritardo: ${actionLabel}`);
  } else {
    banner.classList.add("hidden");
    setText(banner, "");
  }

  const ringDays = el("ring-days");
  const ringUnit = el("ring-unit");
  const absMs = Math.abs(remainingMs);
  const totalHours = Math.floor(absMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (overtime) {
    setText(ringDays, days > 0 ? `${days}g ${hours}h` : `${hours}h`);
    setText(ringUnit, `in ritardo per ${actionLabel}`);
  } else if (days > 0) {
    setText(ringDays, `${days}`);
    setText(ringUnit, `giorn${days === 1 ? "o" : "i"} per ${actionLabel}`);
  } else {
    setText(ringDays, `${hours}`);
    setText(ringUnit, `or${hours === 1 ? "a" : "e"} per ${actionLabel}`);
  }

  setText(el("phase-label"), s.phase === "wearing" ? "Anello inserito" : "Anello fuori");
  setText(
    el("due-date"),
    overtime
      ? `Scadenza superata: ${fmtDateTime(s.due_at)}`
      : `Scadenza: ${fmtDateTime(s.due_at)}`
  );

  const wearDays = s.wear_days;
  const restDays = s.rest_days;
  const totalCycleDays = wearDays + restDays;
  let cursorPct;
  if (s.phase === "wearing") {
    const elapsedDays = elapsedMs / 86400000;
    cursorPct = (Math.min(elapsedDays, wearDays) / totalCycleDays) * 100;
  } else {
    const elapsedDays = elapsedMs / 86400000;
    cursorPct =
      (wearDays / totalCycleDays) * 100 +
      (Math.min(elapsedDays, restDays) / totalCycleDays) * 100;
  }
  el("timeline-cursor").style.transform = `translateX(${Math.min(99.5, Math.max(0.5, cursorPct))}%)`;
  const wearPct = (wearDays / totalCycleDays) * 100;
  el("timeline-wear").style.width = `${wearPct}%`;
  el("timeline-rest").style.width = `${100 - wearPct}%`;
  setText(el("timeline-wear-label"), `${wearDays} giorni dentro`);
  setText(el("timeline-rest-label"), `${restDays} giorni fuori`);

  setText(
    el("action-btn"),
    s.next_action === "remove" ? "Ho tolto l'anello" : "Ho inserito il nuovo anello"
  );
}

const FUTURE_TOLERANCE_MS = 5 * 60000;

// Reads the "when" picker: { at: Date|null } (null = server time) or { error }.
function chosenTime() {
  const mode = document.querySelector('input[name="when"]:checked').value;
  if (mode === "now") return { at: null };

  let at;
  if (mode === "yesterday") {
    at = new Date(Date.now() - 86400000);
  } else {
    const value = el("when-custom").value;
    if (!value) return { error: "Seleziona data e ora." };
    at = new Date(value);
  }

  if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return { error: "L'orario non può essere nel futuro." };
  }
  const s = state.status;
  if (s && s.cycle_started_at && at <= new Date(s.cycle_started_at)) {
    return {
      error: `L'orario deve essere successivo all'ultimo evento (${fmtDateTime(s.cycle_started_at)}).`,
    };
  }
  return { at };
}

function updateWhenPreview() {
  const mode = document.querySelector('input[name="when"]:checked').value;
  el("when-custom-field").classList.toggle("hidden", mode !== "custom");
  if (mode === "custom" && !el("when-custom").value) {
    el("when-custom").value = toLocalInputValue(new Date().toISOString());
  }
  el("when-error").textContent = "";
  el("when-custom").removeAttribute("aria-invalid");
  const { at } = chosenTime();
  el("when-preview").textContent = at ? `Verrà registrato: ${fmtDateTime(at.toISOString())}` : "";
}

function resetWhenPicker() {
  document.querySelector('input[name="when"][value="now"]').checked = true;
  el("when-custom").value = "";
  el("when-details").open = false;
  updateWhenPreview();
}

document.querySelectorAll('input[name="when"]').forEach((r) => {
  r.addEventListener("change", updateWhenPreview);
});
el("when-custom").addEventListener("input", updateWhenPreview);

el("action-btn").addEventListener("click", () => {
  const s = state.status;
  if (!s || !s.next_action) return;
  const when = chosenTime();
  if (when.error) {
    el("when-details").open = true;
    el("when-error").textContent = when.error;
    el("when-custom").setAttribute("aria-invalid", "true");
    return;
  }
  submitAction(s.next_action, when.at);
});

async function submitAction(type, at = null) {
  if (state.busy) return;
  setBusy(true);
  try {
    const body = at ? { type, at: at.toISOString() } : { type };
    const data = await api("/api/ring/action", jsonRequest("POST", body));
    state.status = data.status;
    resetWhenPicker();
    renderDashboard();
    showToast(type === "remove" ? "Anello tolto: registrato." : "Anello inserito: registrato.", {
      actionLabel: "Annulla",
      duration: UNDO_TOAST_MS,
      onAction: () => deleteEvent(data.id, "Azione annullata."),
    });
  } catch (e) {
    showToast(e.message, { kind: "error" });
  } finally {
    setBusy(false);
  }
}

// Deletes the most recent event and refreshes the views that depend on it.
async function deleteEvent(id, doneMessage, { onUndo } = {}) {
  try {
    const data = await api(`/api/history/${id}`, { method: "DELETE" });
    state.status = data.status;
    renderDashboard();
    if (!el("view-history").classList.contains("hidden")) loadHistory();
    showToast(doneMessage, onUndo ? {
      actionLabel: "Annulla",
      duration: UNDO_TOAST_MS,
      onAction: onUndo,
    } : {});
  } catch (e) {
    showToast(e.message, { kind: "error" });
  }
}

el("setup-submit").addEventListener("click", async () => {
  if (state.busy) return;
  const input = el("setup-datetime");
  const errorEl = el("setup-error");
  errorEl.textContent = "";
  input.removeAttribute("aria-invalid");

  if (!input.value) {
    errorEl.textContent = "Seleziona data e ora di inserimento.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }

  setBusy(true);
  try {
    const at = new Date(input.value).toISOString();
    const data = await api("/api/ring/action", jsonRequest("POST", { type: "insert", at }));
    state.status = data.status;
    renderDashboard();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    setBusy(false);
  }
});

// ---------- History ----------

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function loadHistory() {
  let items;
  try {
    items = await api("/api/history?limit=50");
  } catch (e) {
    showToast(e.message, { kind: "error" });
    return;
  }
  const list = el("history-list");
  list.innerHTML = "";
  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "history-item";

    const typeLabel = item.type === "insert" ? "Inserito" : "Tolto";
    const dateLabel = fmtDateTime(item.at);

    const row = document.createElement("div");
    row.className = "history-row";

    const tag = document.createElement("span");
    tag.className = `tag ${item.type}`;
    tag.textContent = typeLabel;

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = dateLabel;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "link-btn";
    editBtn.textContent = "Modifica";
    editBtn.setAttribute("aria-label", `Modifica evento: ${typeLabel}, ${dateLabel}`);
    editBtn.setAttribute("aria-expanded", "false");
    actions.appendChild(editBtn);

    if (idx === 0) {
      const del = document.createElement("button");
      del.className = "link-btn danger";
      del.textContent = "Elimina";
      del.setAttribute("aria-label", `Elimina ultimo evento: ${typeLabel}, ${dateLabel}`);
      del.onclick = () => {
        del.disabled = true;
        deleteEvent(item.id, "Evento eliminato.", {
          // The deleted event is always the one the backend expects next, so re-adding it restores the state.
          onUndo: async () => {
            try {
              const data = await api(
                "/api/ring/action",
                jsonRequest("POST", { type: item.type, at: item.at })
              );
              state.status = data.status;
              renderDashboard();
              if (!el("view-history").classList.contains("hidden")) loadHistory();
              showToast("Evento ripristinato.");
            } catch (e) {
              showToast(e.message, { kind: "error" });
            }
          },
        }).finally(() => {
          del.disabled = false;
        });
      };
      actions.appendChild(del);
    }

    row.appendChild(tag);
    row.appendChild(date);
    row.appendChild(actions);
    li.appendChild(row);

    const editForm = document.createElement("div");
    editForm.className = "history-edit hidden";

    const input = document.createElement("input");
    input.type = "datetime-local";
    input.value = toLocalInputValue(item.at);
    input.setAttribute("aria-label", `Nuova data e ora: ${typeLabel}, ${dateLabel}`);

    const editBtnRow = document.createElement("div");
    editBtnRow.className = "btn-row";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary btn-small";
    saveBtn.textContent = "Salva";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary btn-small";
    cancelBtn.textContent = "Annulla";

    const errorEl = document.createElement("p");
    errorEl.className = "feedback error";
    errorEl.setAttribute("role", "alert");

    editBtnRow.appendChild(saveBtn);
    editBtnRow.appendChild(cancelBtn);
    editForm.appendChild(input);
    editForm.appendChild(editBtnRow);
    editForm.appendChild(errorEl);
    li.appendChild(editForm);

    const setEditing = (open) => {
      errorEl.textContent = "";
      editForm.classList.toggle("hidden", !open);
      editBtn.setAttribute("aria-expanded", String(open));
      if (open) input.focus();
    };

    editBtn.onclick = () => setEditing(editForm.classList.contains("hidden"));
    cancelBtn.onclick = () => {
      setEditing(false);
      editBtn.focus();
    };
    saveBtn.onclick = async () => {
      if (!input.value) return;
      saveBtn.disabled = true;
      errorEl.textContent = "";
      try {
        const at = new Date(input.value).toISOString();
        const data = await api(`/api/history/${item.id}`, jsonRequest("PATCH", { at }));
        state.status = data.status;
        renderDashboard();
        loadHistory();
        showToast("Evento aggiornato.");
      } catch (e) {
        errorEl.textContent = e.message;
        saveBtn.disabled = false;
      }
    };

    list.appendChild(li);
  });
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "Nessun evento registrato. Registra il primo inserimento dalla Dashboard.";
    list.appendChild(empty);
  }
}

// ---------- Settings ----------

async function loadSettings() {
  let s;
  try {
    s = await api("/api/settings");
  } catch (e) {
    showToast(e.message, { kind: "error" });
    return;
  }
  el("settings-server").value = s.ntfy_server || "";
  el("settings-topic").value = s.ntfy_topic || "";
  el("settings-enabled").checked = !!s.notifications_enabled;
  el("settings-email").value = s.email_to || "";
  el("settings-channel").value = s.notification_channel || "ntfy";
  state.emailConfigured = !!s.email_configured;
  state.settingsDirty = false;
  el("settings-feedback").textContent = "";
  renderChannelFields();
}

function renderChannelFields() {
  const isEmail = el("settings-channel").value === "email";
  el("settings-ntfy-fields").classList.toggle("hidden", isEmail);
  el("settings-email-fields").classList.toggle("hidden", !isEmail);
  el("settings-email-hint").textContent = state.emailConfigured
    ? "I promemoria arrivano a questi indirizzi. Separa più indirizzi con una virgola (massimo 10)."
    : "Il server SMTP non è configurato: imposta le variabili RING_SMTP_* sul server (vedi README).";
}

el("settings-channel").addEventListener("change", renderChannelFields);

["input", "change"].forEach((evt) => {
  el("view-settings").addEventListener(evt, (e) => {
    if (e.target.closest("#settings-copy-topic")) return;
    state.settingsDirty = true;
    const feedback = el("settings-feedback");
    feedback.textContent = "Modifiche non salvate.";
    feedback.className = "feedback";
  });
});

// The page may be served over plain http (e.g. a Tailscale IP), where the async clipboard API is unavailable.
async function copyText(text, inputEl) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  inputEl.focus();
  inputEl.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

el("settings-copy-topic").addEventListener("click", async () => {
  const input = el("settings-topic");
  if (!input.value.trim()) {
    showToast("Nessun topic da copiare.", { kind: "error" });
    return;
  }
  const ok = await copyText(input.value.trim(), input);
  showToast(ok ? "Topic copiato." : "Copia non riuscita: il topic è selezionato, copialo a mano.", {
    kind: ok ? "info" : "error",
  });
});

function setSettingsBusy(busy) {
  el("settings-save").disabled = busy;
  el("settings-test").disabled = busy;
}

// Returns true if the settings were saved; shows the error otherwise.
async function saveSettings() {
  const feedback = el("settings-feedback");
  feedback.textContent = "";
  feedback.className = "feedback";
  const body = {
    ntfy_server: el("settings-server").value.trim(),
    ntfy_topic: el("settings-topic").value.trim(),
    notifications_enabled: el("settings-enabled").checked,
    notification_channel: el("settings-channel").value,
    email_to: el("settings-email").value.trim(),
  };
  try {
    await api("/api/settings", jsonRequest("PUT", body));
    state.settingsDirty = false;
    feedback.textContent = "Impostazioni salvate.";
    feedback.className = "feedback ok";
    return true;
  } catch (e) {
    feedback.textContent = e.message;
    feedback.className = "feedback error";
    return false;
  }
}

el("settings-save").addEventListener("click", async () => {
  setSettingsBusy(true);
  try {
    await saveSettings();
  } finally {
    setSettingsBusy(false);
  }
});

el("settings-test").addEventListener("click", async () => {
  setSettingsBusy(true);
  try {
    // Test with what is on screen, not with the previously saved channel.
    if (!(await saveSettings())) return;
    const feedback = el("settings-feedback");
    feedback.textContent = "Impostazioni salvate. Invio del test in corso…";
    feedback.className = "feedback";
    try {
      await api("/api/settings/test-notification", { method: "POST" });
      feedback.textContent = "Notifica di test inviata.";
      feedback.className = "feedback ok";
    } catch (e) {
      feedback.textContent = e.message;
      feedback.className = "feedback error";
    }
  } finally {
    setSettingsBusy(false);
  }
});

// ---------- Boot ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    fetchStatus();
    tickDashboard();
  }
});

switchView(viewFromHash());
showLoadCard("Caricamento…");
fetchStatus();
setInterval(fetchStatus, POLL_MS);
setInterval(tickDashboard, TICK_MS);
