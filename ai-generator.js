import {
  markdownInput,
  toggleAiButton,
  aiContainer,
  aiPromptBox,
  generateButton,
  showAiLog,
  aiLogDialog,
  aiLogs,
  closeAiLog
} from "./common.js";
import { renderPreview } from "./noteEditor.js";
import { attributeLocalWholeDocument, scheduleSend, scheduleDraftSave } from "./p2p.js";

const APP_ID = "p2pmd";
const AI_PROMPT_STORAGE = "p2pmd-ai-prompt";

try {
  const saved = localStorage.getItem(AI_PROMPT_STORAGE);
  if (saved?.trim()) aiPromptBox.value = saved;
} catch { }

aiPromptBox.addEventListener("input", () => {
  try { localStorage.setItem(AI_PROMPT_STORAGE, aiPromptBox.value.trim()); }
  catch { }
});

toggleAiButton.addEventListener("click", () => aiContainer.classList.toggle("hidden"));
showAiLog.style.marginLeft = "8px";
showAiLog.addEventListener("click", () => aiLogDialog.showModal());
closeAiLog.addEventListener("click", () => aiLogDialog.close());

// History button (appended beside Generate / Open Logs)
const aiButtonsEl = document.getElementById("ai-buttons");
if (aiButtonsEl) {
  const historyBtn = document.createElement("button");
  historyBtn.textContent = "\uD83D\uDD58 History";
  historyBtn.style.marginLeft = "8px";
  aiButtonsEl.appendChild(historyBtn);

  let historyDialog = null;

  function ensureHistoryDialog() {
    if (historyDialog) return historyDialog;
    historyDialog = document.createElement("dialog");
    historyDialog.className = "ai-history-dialog";
    historyDialog.style.cssText =
      "width:520px;max-width:95vw;max-height:80vh;overflow-y:auto;border-radius:10px;padding:16px;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px";
    const title = document.createElement("strong");
    title.textContent = "AI Generation History";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "\u2715";
    closeBtn.style.cssText = "background:none;border:none;cursor:pointer;font-size:16px;color:inherit";
    closeBtn.addEventListener("click", () => historyDialog.close());
    header.append(title, closeBtn);

    const listEl = document.createElement("div");
    listEl.id = "mdHistoryList";
    listEl.style.cssText = "display:flex;flex-direction:column;gap:8px";

    historyDialog.append(header, listEl);
    document.body.appendChild(historyDialog);
    return historyDialog;
  }

  historyBtn.addEventListener("click", async () => {
    const dlg = ensureHistoryDialog();
    const listEl = dlg.querySelector("#mdHistoryList");
    listEl.textContent = "Loading\u2026";
    dlg.showModal();

    let enabled = false;
    try { enabled = window.llmMemory ? await window.llmMemory.isEnabled() : false; }
    catch { enabled = false; }

    if (!enabled) {
      listEl.textContent = "";
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:13px;color:#888";
      msg.textContent = "Memory is disabled. Enable it in Settings \u2192 AI / LLMs.";
      listEl.appendChild(msg);
      return;
    }

    let entries;
    try { entries = await window.llmMemory.list({ appId: APP_ID, limit: 200 }); }
    catch { entries = []; }
    const userEntries = entries.filter(e => e.role === "user").reverse();

    if (!userEntries.length) {
      listEl.textContent = "";
      const msg = document.createElement("div");
      msg.style.cssText = "color:#888;font-size:13px";
      msg.textContent = "No history yet.";
      listEl.appendChild(msg);
      return;
    }

    listEl.textContent = "";
    for (const entry of userEntries) {
      const card = document.createElement("div");
      card.style.cssText =
        "padding:10px 12px;border:1px solid var(--browser-theme-border,#333);" +
        "border-radius:8px;cursor:pointer;font-size:13px;transition:background 0.12s";
      const titleDiv = document.createElement("div");
      titleDiv.style.cssText = "font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis";
      titleDiv.textContent = entry.content.slice(0, 100).replace(/\n/g, " ");
      const metaDiv = document.createElement("div");
      metaDiv.style.cssText = "font-size:11px;color:#888;margin-top:3px";
      metaDiv.textContent = relTime(entry.ts);

      card.addEventListener("mouseenter", () => { card.style.background = "var(--browser-theme-hover,rgba(255,255,255,0.07))"; });
      card.addEventListener("mouseleave", () => { card.style.background = ""; });
      card.addEventListener("click", async (ev) => {
        if (ev.target.closest(".history-del-btn")) return;
        let sessionEntries;
        try { sessionEntries = await window.llmMemory.list({ sessionId: entry.sessionId }); }
        catch { sessionEntries = []; }
        const assistant = sessionEntries.find(e => e.role === "assistant");
        markdownInput.value = assistant?.content || entry.content;
        renderPreview();
        scheduleSend();
        scheduleDraftSave();
        dlg.close();
        aiContainer.classList.remove("hidden");
      });

      const delBtn = document.createElement("button");
      delBtn.className = "history-del-btn";
      delBtn.title = "Delete";
      delBtn.textContent = "\u2715";
      delBtn.style.cssText =
        "all:unset;cursor:pointer;margin-left:auto;padding:2px 6px;border-radius:4px;" +
        "font-size:11px;color:var(--settings-danger-color-hover,#c62828);flex-shrink:0;";
      delBtn.addEventListener("mouseenter", () => { delBtn.style.background = "rgba(198,40,40,0.12)"; });
      delBtn.addEventListener("mouseleave", () => { delBtn.style.background = ""; });
      delBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!window.llmMemory) return;
        try { await window.llmMemory.clear({ sessionId: entry.sessionId }); } catch {}
        card.remove();
        if (!listEl.children.length) {
          const msg = document.createElement("div");
          msg.style.cssText = "color:#888;font-size:13px";
          msg.textContent = "No history yet.";
          listEl.appendChild(msg);
        }
      });

      card.style.cssText += ";display:flex;align-items:flex-start;gap:8px";
      const cardInfo = document.createElement("div");
      cardInfo.style.cssText = "flex:1;min-width:0";
      cardInfo.append(titleDiv, metaDiv);
      card.append(cardInfo, delBtn);
      listEl.appendChild(card);
    }
  });
}

function genSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function saveGenToMemory(prompt, output) {
  if (!window.llmMemory) return;
  let enabled = false;
  try { enabled = await window.llmMemory.isEnabled(); } catch { return; }
  if (!enabled) return;
  const sessionId = genSessionId();
  const ts = new Date().toISOString();
  try {
    await window.llmMemory.add({ appId: APP_ID, sessionId, role: "user", content: prompt, model: "", ts });
    await window.llmMemory.add({ appId: APP_ID, sessionId, role: "assistant", content: output, model: "", ts });
  } catch { /* best-effort */ }
}

function relTime(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

async function buildMemoryContext() {
  if (!window.llmMemory) return "";
  let enabled = false;
  try { enabled = await window.llmMemory.isEnabled(); } catch { return ""; }
  if (!enabled) return "";
  try {
    const recent = await window.llmMemory.list({ limit: 50 });
    if (!recent.length) return "";
    const lines = recent.map(e =>
      "[" + e.appId + " " + (e.ts || "").slice(0, 16) + "] " + e.role + ": " + e.content.slice(0, 300)
    );
    return "\n\nThe user's recent activity across PeerSky apps (use as context when relevant):\n" + lines.join("\n");
  } catch { return ""; }
}

function appendLog(title, message) {
  const dt = document.createElement("dt");
  dt.textContent = title;
  aiLogs.appendChild(dt);
  const dd = document.createElement("dd");
  dd.textContent = message;
  aiLogs.appendChild(dd);
}

const EDIT_KEYWORDS = /\b(add|edit|modify|change|update|rewrite|improve|fix|remove|delete|replace|insert|make|create|write|put|include|move|merge|split|format|restructure|reorganize|shorten|expand|extend|summarize|translate|convert|transform|rephrase|paraphrase|simplify|elaborate|proofread|correct|revise|refine|polish|enhance|optimize|beautify|clean|append|prepend|swap|rename|number|bold|italicize|underline|highlight|indent|dedent|wrap|unwrap|generate|compose|draft|outline|list|table|heading|title|section|paragraph|sentence|bullet|link|image|code|block|quote|style|theme|tone|voice)\b/i;

function isEditRequest(prompt) {
  return EDIT_KEYWORDS.test(prompt.toLowerCase().trim());
}

async function generateMarkdown() {
  const prompt = aiPromptBox.value.trim();
  if (!prompt) { alert("Please enter a prompt."); return; }

  aiLogs.innerHTML = "";
  appendLog("Prompt", prompt);
  aiLogDialog.showModal();

  if (!window.llm || !window.llm.chat) {
    appendLog("Error", "LLM API not available. Enable LLM in settings.");
    return;
  }

  try {
    const draft = markdownInput.value;
    const hasDraft = draft.trim().length > 0;
    const editMode = hasDraft && isEditRequest(prompt);

    const memCtx = await buildMemoryContext();
    let systemContent, userContent;

    if (hasDraft && editMode) {
      systemContent = "You are a document editor. Apply the user's edit instruction to the draft below. Return ONLY the complete updated document. Do not add explanations, commentary, or any text outside the document.\n\nFor presentation slides: Use '---' to separate slides. Add speaker notes as HTML comments like <!-- Speaker notes: your notes here -->. Example:\n# Title Slide\nContent here\n<!-- Speaker notes: Introduction -->\n---\n# Second Slide\nMore content";
      userContent = "Edit instruction: " + prompt + "\n\nDocument:\n" + draft;
    } else if (hasDraft) {
      systemContent = "The user has a document and wants to ask a question. Answer the question concisely. Do NOT include or repeat the document in your response.";
      userContent = "Question: " + prompt + "\n\nDocument for context:\n" + draft;
    } else {
      systemContent = "You are a helpful assistant. Generate markdown content based on the user's request.\n\nFor presentation slides: Use '---' to separate slides. Add speaker notes as HTML comments like <!-- Speaker notes: your notes here -->. Each slide should be concise and focused. Example:\n# Title Slide\nYour opening content\n<!-- Speaker notes: Introduce yourself and topic -->\n---\n# Key Points\n- Point 1\n- Point 2\n<!-- Speaker notes: Elaborate on each point -->";
      userContent = prompt;
    }
    systemContent += memCtx;

    if (hasDraft) appendLog("Draft", draft);
    appendLog("Mode", editMode ? "Edit draft" : hasDraft ? "Question (draft unchanged)" : "Generate new");

    const messages = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent }
    ];
    const response = await window.llm.chat({ messages, temperature: 0.6, maxTokens: 4096 });
    const output = response?.content || "";

    if (!output.trim()) { appendLog("Result", "No content generated."); return; }

    if (editMode || !hasDraft) {
      markdownInput.value = output;
      attributeLocalWholeDocument({ reset: true, broadcastPresence: true });
      renderPreview();
      scheduleSend();
      scheduleDraftSave();
    }
    appendLog("Result", output);

    await saveGenToMemory(prompt, output);
  } catch (error) {
    appendLog("Error", error.message || String(error));
  }
}

generateButton.addEventListener("click", generateMarkdown);
