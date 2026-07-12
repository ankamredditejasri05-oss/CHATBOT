/**
 * GeminiChat – Frontend Application
 * All frontend logic: conversation management, SSE streaming,
 * markdown rendering, search, modals, toasts, keyboard shortcuts.
 */

const API = "";   // same-origin
let currentId  = null;
let streaming  = false;

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const convList        = document.getElementById("conversationsList");
const msgContainer    = document.getElementById("messagesContainer");
const welcomeScreen   = document.getElementById("welcomeScreen");
const typingIndicator = document.getElementById("typingIndicator");
const messageInput    = document.getElementById("messageInput");
const sendBtn         = document.getElementById("sendBtn");
const newChatBtn      = document.getElementById("newChatBtn");
const personaSelect   = document.getElementById("personaSelect");
const searchInput     = document.getElementById("searchInput");
const searchClear     = document.getElementById("searchClear");
const searchResults   = document.getElementById("searchResults");
const convTitle       = document.getElementById("currentConvTitle");
const personaBadge    = document.getElementById("personaBadge");
const renameBtn       = document.getElementById("renameBtn");
const deleteConvBtn   = document.getElementById("deleteConvBtn");
const sidebar         = document.getElementById("sidebar");
const sidebarToggle   = document.getElementById("sidebarToggle");
const mobileMenuBtn   = document.getElementById("mobileMenuBtn");
const toastContainer  = document.getElementById("toastContainer");
const deleteModal     = document.getElementById("deleteModal");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn= document.getElementById("confirmDeleteBtn");
const renameModal     = document.getElementById("renameModal");
const renameInput     = document.getElementById("renameInput");
const cancelRenameBtn = document.getElementById("cancelRenameBtn");
const confirmRenameBtn= document.getElementById("confirmRenameBtn");
const micBtn         = document.getElementById("micBtn");
const darkLightBtn    = document.getElementById("darkLightBtn");
const debugToggle     = document.getElementById("debugToggle");
const debugPanel      = document.getElementById("debugPanel");
const debugApiKey     = document.getElementById("debugApiKey");
const debugLatency    = document.getElementById("debugLatency");
const debugSpeech     = document.getElementById("debugSpeech");
const debugMsgCount   = document.getElementById("debugMsgCount");

const PERSONA_LABELS = { default:"General", coding:"Code Expert", teacher:"Teacher", creative:"Creative", analyst:"Analyst" };
const PERSONA_ICONS  = { default:"🤖", coding:"💻", teacher:"📚", creative:"🎨", analyst:"📊" };

/* ═══════════════════════════════════════════════════════════════════════════ */
async function fetchConfig() {
  try {
    const data = await api("/api/config");
    if (data.success && debugApiKey) {
      debugApiKey.textContent = data.keyMasked;
    }
  } catch (err) {
    console.warn("Could not fetch config status:", err);
  }
}

function toggleDarkMode(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  const sunIcon = document.querySelector(".sun-icon");
  const moonIcon = document.querySelector(".moon-icon");
  if (sunIcon && moonIcon) {
    sunIcon.style.display = isDark ? "block" : "none";
    moonIcon.style.display = isDark ? "none" : "block";
  }
  localStorage.setItem("gemini-chat-theme-mode", isDark ? "dark" : "light");
}

async function init() {
  await loadList();
  bindEvents();
  messageInput.focus();
  fetchConfig();

  // Theme mode initialization (Light mode default)
  const savedMode = localStorage.getItem("gemini-chat-theme-mode") || "light";
  toggleDarkMode(savedMode === "dark");

  // Speech support initialization
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (debugSpeech) debugSpeech.textContent = SpeechRecognition ? "Supported" : "Unsupported";
}

/* ── Conversation List ────────────────────────────────────────────────────── */
async function loadList() {
  try {
    const { conversations } = await api("/api/conversations");
    renderList(conversations || []);
  } catch {
    showToast("Cannot reach server. Is it running?", "error");
  }
}

function renderList(convs) {
  if (!convs.length) {
    convList.innerHTML = `<div class="conv-empty">No conversations yet.<br>Click <strong>New Conversation</strong> to start.</div>`;
    return;
  }
  convList.innerHTML = convs.map(c => `
    <div class="conv-item ${c.id === currentId ? "active" : ""}" data-id="${c.id}" role="listitem" tabindex="0">
      <div class="conv-item-icon">${PERSONA_ICONS[c.persona] || "🤖"}</div>
      <div class="conv-item-content">
        <div class="conv-item-title">${esc(c.title)}</div>
        <div class="conv-item-preview">${c.preview ? esc(c.preview.slice(0, 60)) : "No messages yet"}</div>
      </div>
      <div class="conv-item-meta">${relDate(c.updatedAt)}</div>
      <button class="conv-item-delete" data-id="${c.id}" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>`).join("");

  convList.querySelectorAll(".conv-item").forEach(el =>
    el.addEventListener("click", e => { if (!e.target.closest(".conv-item-delete")) openConv(el.dataset.id); })
  );
  convList.querySelectorAll(".conv-item-delete").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); promptDelete(btn.dataset.id); })
  );
}

/* ── Open Conversation ────────────────────────────────────────────────────── */
async function openConv(id) {
  if (streaming) return showToast("Wait for the current response.", "info");
  try {
    const { conversation: c } = await api(`/api/conversations/${id}`);
    currentId = id;
    convTitle.textContent = c.title;
    personaBadge.textContent = PERSONA_LABELS[c.persona] || "General";
    personaSelect.value = c.persona || "default";
    renameBtn.style.display = "flex";
    deleteConvBtn.style.display = "flex";

    welcomeScreen.style.display  = "none";
    msgContainer.style.display   = "flex";
    msgContainer.innerHTML       = "";

    c.messages.forEach(m => renderMsg(m.role, m.content, m.timestamp, false));
    if (debugMsgCount) debugMsgCount.textContent = c.messages.length;
    scrollBottom();
    highlightActive(id);
    messageInput.focus();
    closeMobileSidebar();
  } catch {
    showToast("Failed to load conversation.", "error");
  }
}

/* ── Create Conversation ──────────────────────────────────────────────────── */
async function newConv(persona = "default") {
  if (streaming) return showToast("Wait for the current response.", "info");
  try {
    const { conversation: c } = await api("/api/conversations", "POST", { title: "New Conversation", persona });
    await loadList();
    await openConv(c.id);
    personaSelect.value = persona;
    showToast("New conversation started!", "success");
  } catch {
    showToast("Failed to create conversation.", "error");
  }
}

/* ── Send Message (SSE Streaming) ────────────────────────────────────────── */
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || streaming) return;

  if (!currentId) await newConv(personaSelect.value);

  messageInput.value = "";
  autoResize();
  sendBtn.disabled = true;
  renderMsg("user", text, new Date().toISOString(), true);
  scrollBottom();

  streaming = true;
  sendBtn.classList.add("loading");
  typingIndicator.style.display = "flex";
  scrollBottom();

  const aiBubble = createStreamBubble();

  // Increment message count by 1 for user message
  if (debugMsgCount) debugMsgCount.textContent = parseInt(debugMsgCount.textContent || 0) + 1;

  const startFetchTime = performance.now();
  try {
    const resp = await fetch(`${API}/api/conversations/${currentId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    typingIndicator.style.display = "none";
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const p = JSON.parse(line.slice(6));
          if (p.chunk) { fullText += p.chunk; aiBubble.innerHTML = renderMd(fullText); addCopyBtns(aiBubble); scrollBottom(); }
          if (p.done)  { await loadList(); }
          if (p.error) { throw new Error(p.error); }
        } catch (pe) { if (pe.message !== "Unexpected end of JSON input") console.warn(pe.message); }
      }
    }

    const latency = ((performance.now() - startFetchTime) / 1000).toFixed(2);
    if (debugLatency) debugLatency.textContent = `${latency}s`;

    // Increment message count by 1 for model reply
    if (debugMsgCount) debugMsgCount.textContent = parseInt(debugMsgCount.textContent || 0) + 1;

  } catch (err) {
    typingIndicator.style.display = "none";
    aiBubble.innerHTML = `<span style="color:var(--red)">Error: ${esc(err.message)}</span>`;
    showToast(err.message, "error");
  } finally {
    streaming = false;
    sendBtn.disabled = messageInput.value.trim() === "";
    sendBtn.classList.remove("loading");
    scrollBottom();
  }
}

/* ── Render Message ───────────────────────────────────────────────────────── */
function renderMsg(role, content, ts, animate) {
  const w = document.createElement("div");
  w.className = `message ${role}`;
  if (!animate) w.style.animation = "none";

  const avatar = role === "user"
    ? `<div class="msg-avatar">U</div>`
    : `<div class="msg-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#ag${Date.now()})"/>
          <defs>
            <linearGradient id="ag${Date.now()}" x1="2" y1="7" x2="22" y2="7">
              <stop offset="0%" stop-color="#8b5cf6"/>
              <stop offset="100%" stop-color="#60a5fa"/>
            </linearGradient>
          </defs>
        </svg>
      </div>`;

  const bubble = role === "user" ? esc(content) : renderMd(content);
  w.innerHTML = `${avatar}
    <div class="msg-wrap">
      <div class="msg-bubble">${bubble}</div>
      <div class="msg-time">${fmtTime(ts)}</div>
    </div>`;

  if (role === "model") addCopyBtns(w.querySelector(".msg-bubble"));
  msgContainer.appendChild(w);
}

function createStreamBubble() {
  const id = Date.now();
  const w = document.createElement("div");
  w.className = "message model";
  w.innerHTML = `
    <div class="msg-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#sg${id})"/>
        <defs>
          <linearGradient id="sg${id}" x1="2" y1="7" x2="22" y2="7">
            <stop offset="0%" stop-color="#8b5cf6"/>
            <stop offset="100%" stop-color="#60a5fa"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
    <div class="msg-wrap">
      <div class="msg-bubble"></div>
    </div>`;
  msgContainer.appendChild(w);
  return w.querySelector(".msg-bubble");
}


/* ── Delete ───────────────────────────────────────────────────────────────── */
let pendingDeleteId = null;
function promptDelete(id) { pendingDeleteId = id; deleteModal.style.display = "flex"; }

async function doDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = null;
  deleteModal.style.display = "none";
  try {
    await api(`/api/conversations/${id}`, "DELETE");
    if (currentId === id) { currentId = null; showWelcome(); }
    await loadList();
    showToast("Conversation deleted.", "success");
  } catch { showToast("Failed to delete.", "error"); }
}

/* ── Rename ───────────────────────────────────────────────────────────────── */
async function doRename() {
  if (!currentId) return;
  const title = renameInput.value.trim();
  if (!title) return;
  renameModal.style.display = "none";
  try {
    await api(`/api/conversations/${currentId}/title`, "PATCH", { title });
    convTitle.textContent = title;
    await loadList();
    showToast("Renamed.", "success");
  } catch { showToast("Failed to rename.", "error"); }
}

/* ── Search ───────────────────────────────────────────────────────────────── */
let searchTimer = null;
async function doSearch(q) {
  if (!q) { searchResults.style.display = "none"; return; }
  try {
    const { results } = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (!results.length) {
      searchResults.innerHTML = `<div class="search-result-item" style="color:var(--text-muted);font-size:0.78rem">No results for "${esc(q)}"</div>`;
    } else {
      searchResults.innerHTML = results.map(r => `
        <div class="search-result-item" data-id="${r.id}">
          <div class="search-result-title">${PERSONA_ICONS[r.persona]||"🤖"} ${esc(r.title)}</div>
          ${r.matchingMessages[0] ? `<div class="search-result-preview">${highlight(r.matchingMessages[0].preview, q)}</div>` : ""}
        </div>`).join("");
      searchResults.querySelectorAll("[data-id]").forEach(el =>
        el.addEventListener("click", () => { openConv(el.dataset.id); clearSearch(); })
      );
    }
    searchResults.style.display = "block";
  } catch { /* silent */ }
}
function clearSearch() { searchInput.value=""; searchClear.style.display="none"; searchResults.style.display="none"; }

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function showWelcome() {
  welcomeScreen.style.display = "flex";
  msgContainer.style.display  = "none";
  convTitle.textContent = "GeminiChat";
  personaBadge.textContent = "General";
  renameBtn.style.display = "none";
  deleteConvBtn.style.display = "none";
  document.querySelectorAll(".conv-item").forEach(e => e.classList.remove("active"));
}
function highlightActive(id) {
  document.querySelectorAll(".conv-item").forEach(e => e.classList.toggle("active", e.dataset.id === id));
}
function scrollBottom() { requestAnimationFrame(() => { msgContainer.scrollTop = msgContainer.scrollHeight; }); }
function autoResize() { messageInput.style.height = "auto"; messageInput.style.height = Math.min(messageInput.scrollHeight,160) + "px"; }
function closeMobileSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.remove("mobile-open");
    document.querySelector(".overlay-backdrop")?.remove();
  }
}

async function api(url, method = "GET", body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!data.success && data.error) throw new Error(data.error);
  return data;
}

function showToast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const icons = { success: "✓", error: "✕", info: "i" };
  t.innerHTML = `<div class="toast-icon">${icons[type] || "i"}</div> ${esc(msg)}`;
  toastContainer.appendChild(t);
  setTimeout(() => { t.style.opacity="0"; t.style.transition="opacity 0.3s"; setTimeout(() => t.remove(), 300); }, 4000);
}

/* ── Markdown Renderer ────────────────────────────────────────────────────── */
function renderMd(text) {
  let h = esc(text);
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><button class="copy-code-btn" onclick="copyCode(this)">Copy</button><code class="lang-${lang}">${code.trimEnd()}</code></pre>`);
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  h = h.replace(/^# (.+)$/gm,  "<h2>$1</h2>");
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g,   "<em>$1</em>");
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/^---+$/gm, "<hr/>");
  h = h.replace(/((?:^[*\-+] .+\n?)+)/gm, b => `<ul>${b.trim().split("\n").map(l=>`<li>${l.replace(/^[*\-+] /,"")}</li>`).join("")}</ul>`);
  h = h.replace(/((?:^\d+\. .+\n?)+)/gm, b => `<ol>${b.trim().split("\n").map(l=>`<li>${l.replace(/^\d+\. /,"")}</li>`).join("")}</ol>`);
  h = h.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>");
  h = `<p>${h}</p>`;
  h = h.replace(/<p>(<(?:pre|ul|ol|h[1-6]|hr))/g, "$1");
  h = h.replace(/((?:pre|ul|ol|h[1-6]|hr)>)<\/p>/g, "$1");
  return h;
}

function addCopyBtns(el) {
  el.querySelectorAll("pre").forEach(pre => {
    if (!pre.querySelector(".copy-code-btn")) {
      const b = document.createElement("button");
      b.className = "copy-code-btn"; b.textContent = "Copy"; b.onclick = () => copyCode(b);
      pre.prepend(b);
    }
  });
}

window.copyCode = btn => {
  const code = btn.parentElement.querySelector("code");
  if (code) navigator.clipboard.writeText(code.innerText).then(() => { btn.textContent="Copied!"; setTimeout(()=>btn.textContent="Copy",2000); });
};

/* ── Utilities ────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function highlight(text, q) { return esc(text).replace(new RegExp(`(${esc(q).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`, "gi"), "<mark>$1</mark>"); }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); } catch { return ""; } }
function relDate(iso) {
  try {
    const d=(Date.now()-new Date(iso))/1000;
    if(d<60) return "now"; if(d<3600) return `${Math.floor(d/60)}m`;
    if(d<86400) return `${Math.floor(d/3600)}h`; if(d<604800) return `${Math.floor(d/86400)}d`;
    return new Date(iso).toLocaleDateString([],{month:"short",day:"numeric"});
  } catch { return ""; }
}

/* ── Event Listeners ──────────────────────────────────────────────────────── */
function bindEvents() {
  sendBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("input", () => { autoResize(); sendBtn.disabled = !messageInput.value.trim() || streaming; });
  messageInput.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  newChatBtn.addEventListener("click", () => newConv(personaSelect.value));

  document.querySelectorAll(".persona-card").forEach(c => {
    c.addEventListener("click", () => newConv(c.dataset.persona));
    c.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" ") newConv(c.dataset.persona); });
  });

  sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("collapsed"));
  mobileMenuBtn.addEventListener("click", () => {
    sidebar.classList.add("mobile-open");
    const bd = document.createElement("div");
    bd.className = "overlay-backdrop";
    bd.addEventListener("click", closeMobileSidebar);
    document.body.appendChild(bd);
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    searchClear.style.display = q ? "block" : "none";
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(q), 300);
  });
  searchClear.addEventListener("click", clearSearch);
  searchInput.addEventListener("keydown", e => { if(e.key==="Escape") clearSearch(); });

  renameBtn.addEventListener("click", () => {
    renameInput.value = convTitle.textContent;
    renameModal.style.display = "flex";
    setTimeout(() => renameInput.select(), 50);
  });
  cancelRenameBtn.addEventListener("click", () => renameModal.style.display="none");
  confirmRenameBtn.addEventListener("click", doRename);
  renameInput.addEventListener("keydown", e => { if(e.key==="Enter") doRename(); if(e.key==="Escape") renameModal.style.display="none"; });

  deleteConvBtn.addEventListener("click", () => { if(currentId) promptDelete(currentId); });
  cancelDeleteBtn.addEventListener("click", () => { pendingDeleteId=null; deleteModal.style.display="none"; });
  confirmDeleteBtn.addEventListener("click", doDelete);

  deleteModal.addEventListener("click", e => { if(e.target===deleteModal) { pendingDeleteId=null; deleteModal.style.display="none"; } });
  renameModal.addEventListener("click", e => { if(e.target===renameModal) renameModal.style.display="none"; });

  document.addEventListener("keydown", e => {
    if((e.ctrlKey||e.metaKey)&&e.key==="k") { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    if(e.key==="Escape") { deleteModal.style.display="none"; renameModal.style.display="none"; clearSearch(); }
  });

  darkLightBtn.addEventListener("click", () => {
    const isDark = !document.body.classList.contains("dark-mode");
    toggleDarkMode(isDark);
  });

  debugToggle.addEventListener("click", () => {
    const isHidden = debugPanel.style.display === "none";
    debugPanel.style.display = isHidden ? "flex" : "none";

    const arrow = debugToggle.querySelector("svg");
    if (arrow) {
      arrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
      arrow.style.transition = "transform var(--t2)";
    }
  });

  /* ── Theme Switcher ── */
  const savedTheme = localStorage.getItem("gemini-chat-theme") || "violet";
  setTheme(savedTheme);

  document.querySelectorAll(".theme-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      setTheme(dot.dataset.theme);
    });
  });

  /* ── Voice Input (Speech Recognition) ── */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      micBtn.classList.add("listening");
      micBtn.title = "Listening...";
      showToast("Voice input active. Speak now...", "info");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      messageInput.value = (messageInput.value + " " + transcript).trim();
      autoResize();
      sendBtn.disabled = false;
      showToast("Voice captured!", "success");
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
      if (e.error === "not-allowed") {
        showToast("Microphone permission denied.", "error");
      } else {
        showToast("Voice input error: " + e.error, "error");
      }
    };

    recognition.onend = () => {
      micBtn.classList.remove("listening");
      micBtn.title = "Voice Input";
    };
  }

  micBtn.addEventListener("click", () => {
    if (!recognition) {
      showToast("Speech recognition is not supported in this browser.", "error");
      return;
    }
    if (micBtn.classList.contains("listening")) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
}

function setTheme(themeName) {
  document.body.classList.remove("theme-violet", "theme-cyan", "theme-amber", "theme-rose", "theme-emerald");
  if (themeName !== "violet") {
    document.body.classList.add(`theme-${themeName}`);
  }
  document.querySelectorAll(".theme-dot").forEach(dot => {
    dot.classList.toggle("active", dot.dataset.theme === themeName);
  });
  localStorage.setItem("gemini-chat-theme", themeName);
}

init().catch(console.error);
