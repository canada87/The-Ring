const CIRCUMFERENCE = 2 * Math.PI * 88;
const POLL_MS = 30000;
const TICK_MS = 1000;

const el = (id) => document.getElementById(id);

const state = {
  status: null,
};

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

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  el(`view-${name}`).classList.remove("hidden");
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add("active");
  if (name === "history") loadHistory();
  if (name === "settings") loadSettings();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

async function fetchStatus() {
  const res = await fetch("/api/status");
  state.status = await res.json();
  renderDashboard();
}

function renderDashboard() {
  const s = state.status;
  const setupCard = el("setup-card");
  const dashCard = el("dashboard-card");

  if (!s || s.phase === "setup_required") {
    setupCard.classList.remove("hidden");
    dashCard.classList.add("hidden");
    return;
  }

  setupCard.classList.add("hidden");
  dashCard.classList.remove("hidden");
  tickDashboard();
}

function tickDashboard() {
  const s = state.status;
  if (!s || s.phase === "setup_required") return;

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
    banner.textContent = `In ritardo: ${actionLabel}`;
  } else {
    banner.classList.add("hidden");
  }

  const ringDays = el("ring-days");
  const ringUnit = el("ring-unit");
  const absMs = Math.abs(remainingMs);
  const totalHours = Math.floor(absMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (overtime) {
    ringDays.textContent = days > 0 ? `${days}g ${hours}h` : `${hours}h`;
    ringUnit.textContent = `in ritardo per ${actionLabel}`;
  } else if (days > 0) {
    ringDays.textContent = `${days}`;
    ringUnit.textContent = `giorn${days === 1 ? "o" : "i"} per ${actionLabel}`;
  } else {
    ringDays.textContent = `${hours}`;
    ringUnit.textContent = `or${hours === 1 ? "a" : "e"} per ${actionLabel}`;
  }

  el("phase-label").textContent =
    s.phase === "wearing" ? "Anello inserito" : "Anello fuori";
  el("due-date").textContent = overtime
    ? `Scadenza superata: ${fmtDateTime(s.due_at)}`
    : `Scadenza: ${fmtDateTime(s.due_at)}`;

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
  el("timeline-cursor").style.left = `${Math.min(100, Math.max(0, cursorPct))}%`;

  const actionBtn = el("action-btn");
  actionBtn.textContent =
    s.next_action === "remove" ? "Ho tolto l'anello" : "Ho inserito il nuovo anello";
  actionBtn.onclick = () => submitAction(s.next_action);
}

async function submitAction(type) {
  const res = await fetch("/api/ring/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  if (res.ok) {
    const data = await res.json();
    state.status = data.status;
    renderDashboard();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Errore durante il salvataggio.");
  }
}

el("setup-submit").addEventListener("click", async () => {
  const value = el("setup-datetime").value;
  if (!value) {
    alert("Seleziona data e ora.");
    return;
  }
  const at = new Date(value).toISOString();
  const res = await fetch("/api/ring/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "insert", at }),
  });
  if (res.ok) {
    const data = await res.json();
    state.status = data.status;
    renderDashboard();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Errore durante il salvataggio.");
  }
});

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function loadHistory() {
  const res = await fetch("/api/history?limit=50");
  const items = await res.json();
  const list = el("history-list");
  list.innerHTML = "";
  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "history-item";

    const row = document.createElement("div");
    row.className = "history-row";

    const tag = document.createElement("span");
    tag.className = `tag ${item.type}`;
    tag.textContent = item.type === "insert" ? "Inserito" : "Tolto";

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = fmtDateTime(item.at);

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "link-btn";
    editBtn.textContent = "Modifica";
    actions.appendChild(editBtn);

    if (idx === 0) {
      const undo = document.createElement("button");
      undo.className = "link-btn";
      undo.textContent = "Annulla";
      undo.onclick = async () => {
        if (!confirm("Annullare l'ultimo evento registrato?")) return;
        const r = await fetch(`/api/history/${item.id}`, { method: "DELETE" });
        if (r.ok) {
          loadHistory();
          fetchStatus();
        }
      };
      actions.appendChild(undo);
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

    const editBtnRow = document.createElement("div");
    editBtnRow.className = "btn-row";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary btn-small";
    saveBtn.textContent = "Salva";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary btn-small";
    cancelBtn.textContent = "Annulla modifica";

    const errorEl = document.createElement("p");
    errorEl.className = "feedback error";

    editBtnRow.appendChild(saveBtn);
    editBtnRow.appendChild(cancelBtn);
    editForm.appendChild(input);
    editForm.appendChild(editBtnRow);
    editForm.appendChild(errorEl);
    li.appendChild(editForm);

    editBtn.onclick = () => {
      errorEl.textContent = "";
      editForm.classList.toggle("hidden");
    };
    cancelBtn.onclick = () => editForm.classList.add("hidden");
    saveBtn.onclick = async () => {
      if (!input.value) return;
      const at = new Date(input.value).toISOString();
      const r = await fetch(`/api/history/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at }),
      });
      if (r.ok) {
        loadHistory();
        fetchStatus();
      } else {
        const err = await r.json().catch(() => ({}));
        errorEl.textContent = err.detail || "Errore nella modifica.";
      }
    };

    list.appendChild(li);
  });
  if (items.length === 0) {
    list.innerHTML = "<li>Nessun evento registrato.</li>";
  }
}

async function loadSettings() {
  const res = await fetch("/api/settings");
  const s = await res.json();
  el("settings-server").value = s.ntfy_server || "";
  el("settings-topic").value = s.ntfy_topic || "";
  el("settings-enabled").checked = !!s.notifications_enabled;
  el("settings-email").value = s.email_to || "";
  el("settings-channel").value = s.notification_channel || "ntfy";
  state.emailConfigured = !!s.email_configured;
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
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    feedback.textContent = "Impostazioni salvate.";
    feedback.className = "feedback ok";
    return true;
  }
  const err = await res.json().catch(() => ({}));
  feedback.textContent =
    typeof err.detail === "string" ? err.detail : "Errore nel salvataggio.";
  feedback.className = "feedback error";
  return false;
}

el("settings-save").addEventListener("click", saveSettings);

el("settings-test").addEventListener("click", async () => {
  // Test with what is on screen, not with the previously saved channel.
  if (!(await saveSettings())) return;
  const feedback = el("settings-feedback");
  feedback.textContent = "Invio in corso...";
  feedback.className = "feedback";
  const res = await fetch("/api/settings/test-notification", { method: "POST" });
  if (res.ok) {
    feedback.textContent = "Notifica di test inviata.";
    feedback.className = "feedback ok";
  } else {
    const err = await res.json().catch(() => ({}));
    feedback.textContent = err.detail || "Invio fallito.";
    feedback.className = "feedback error";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

fetchStatus();
setInterval(fetchStatus, POLL_MS);
setInterval(tickDashboard, TICK_MS);
