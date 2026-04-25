import { markdownInput } from "./common.js";
import { scheduleRender } from "./noteEditor.js";
import { TEMPLATES, applyTemplate } from "./templates.js";

let latexModeEnabled = false;
let ieeeModeEnabled = false;
let templateMenuInitialized = false;
let activeTemplateId = null;

export function initToolbar() {
  window.latexModeEnabled = false;
  window.ieeeModeEnabled = false;
  window.activeTemplateId = null;
  setupKeyboardShortcuts();
  setupToolbarButtons();
  initTemplates();
  syncLatexModeUi();
  syncTemplateButtonState();
}

function setupKeyboardShortcuts() {
  markdownInput.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    const hasSelection = markdownInput.selectionStart !== markdownInput.selectionEnd;

    if (modKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          toggleBold();
          break;
        case "i":
          e.preventDefault();
          toggleItalic();
          break;
        case "k":
          e.preventDefault();
          insertLink();
          break;
        case "d":
          e.preventDefault();
          duplicateLine();
          break;
        case "c":
          if (!hasSelection) {
            e.preventDefault();
            copyLine();
          }
          break;
        case "x":
          if (!hasSelection) {
            e.preventDefault();
            removeLine();
          }
          break;
      }
    } else if (e.key === "Enter") {
      handleEnterKey(e);
    }
  });
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function copyTextToClipboard(text) {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        try {
          fallbackCopyText(text);
        } catch (err) {
          console.warn("Failed to copy text to clipboard:", err);
        }
      });
      return;
    }
    fallbackCopyText(text);
  } catch (err) {
    console.warn("Failed to copy text to clipboard:", err);
  }
}

function getSelectedLineRange() {
  const { start, end, text } = getSelection();
  const selStart = Math.min(start, end);
  const selEnd = Math.max(start, end);
  const firstLineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const lastLineEnd = text.indexOf("\n", selEnd);
  const actualLastLineEnd = lastLineEnd === -1 ? text.length : lastLineEnd;
  return { start, end, text, selStart, selEnd, firstLineStart, lastLineEnd, actualLastLineEnd };
}

function setupToolbarButtons() {
  document.getElementById("toolbar-bold")?.addEventListener("click", toggleBold);
  document.getElementById("toolbar-italic")?.addEventListener("click", toggleItalic);
  document.getElementById("toolbar-h1")?.addEventListener("click", () => insertHeader(1));
  document.getElementById("toolbar-h2")?.addEventListener("click", () => insertHeader(2));
  document.getElementById("toolbar-ul")?.addEventListener("click", insertUnorderedList);
  document.getElementById("toolbar-ol")?.addEventListener("click", insertOrderedList);
  document.getElementById("toolbar-link")?.addEventListener("click", insertLink);
  document.getElementById("toolbar-code")?.addEventListener("click", insertCodeBlock);
  document.getElementById("toolbar-quote")?.addEventListener("click", insertQuote);
  document.getElementById("toolbar-image")?.addEventListener("click", insertImage);
  document.getElementById("toolbar-inline-code")?.addEventListener("click", insertInlineCode);
  document.getElementById("toolbar-math-inline")?.addEventListener("click", insertInlineMath);
  document.getElementById("toolbar-math-block")?.addEventListener("click", insertBlockMath);
  document.getElementById("toolbar-latex-templates")?.addEventListener("click", toggleLatexMode);
  document.getElementById("toolbar-template-picker")?.addEventListener("click", toggleTemplateMenu);
}

function getSelection() {
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const text = markdownInput.value;
  const selectedText = text.substring(start, end);
  return { start, end, text, selectedText };
}

function replaceSelectionWithUndo(newText, cursorOffset = 0) {
  markdownInput.focus();
  const start = markdownInput.selectionStart;
  document.execCommand('insertText', false, newText);
  const newCursorPos = start + newText.length + cursorOffset;
  markdownInput.setSelectionRange(newCursorPos, newCursorPos);
  scheduleRender();
}

function wrapSelection(prefix, suffix = prefix) {
  const { selectedText } = getSelection();
  if (selectedText) {
    replaceSelectionWithUndo(prefix + selectedText + suffix, 0);
  } else {
    replaceSelectionWithUndo(prefix + suffix, -suffix.length);
  }
}

function toggleBold() {
  wrapSelection("**");
}

function toggleItalic() {
  wrapSelection("*");
}

function insertHeader(level) {
  const { start, text } = getSelection();
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start);
  const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
  const currentLine = text.substring(lineStart, actualLineEnd);
  
  const headerPrefix = "#".repeat(level) + " ";
  
  markdownInput.focus();
  
  if (currentLine.startsWith(headerPrefix)) {
    const newLine = currentLine.substring(headerPrefix.length);
    markdownInput.setSelectionRange(lineStart, actualLineEnd);
    document.execCommand('insertText', false, newLine);
    const newCursorPos = Math.max(lineStart, start - headerPrefix.length);
    markdownInput.setSelectionRange(newCursorPos, newCursorPos);
  } else {
    const cleanLine = currentLine.replace(/^#+\s*/, "");
    const newLine = headerPrefix + cleanLine;
    markdownInput.setSelectionRange(lineStart, actualLineEnd);
    document.execCommand('insertText', false, newLine);
    const oldHeaderMatch = currentLine.match(/^#+\s*/);
    const oldHeaderLen = oldHeaderMatch ? oldHeaderMatch[0].length : 0;
    const newCursorPos = start - oldHeaderLen + headerPrefix.length;
    markdownInput.setSelectionRange(newCursorPos, newCursorPos);
  }
  
  scheduleRender();
}

function insertUnorderedList() {
  insertListItem("- ");
}

function insertOrderedList() {
  insertListItem("1. ");
}

function insertListItem(prefix) {
  const { start, end, text } = getSelection();
  const selStart = Math.min(start, end);
  const selEnd = Math.max(start, end);
  
  // Find all lines in selection
  const firstLineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const lastLineEnd = text.indexOf("\n", selEnd);
  const actualLastLineEnd = lastLineEnd === -1 ? text.length : lastLineEnd;
  
  const selectedText = text.substring(firstLineStart, actualLastLineEnd);
  const lines = selectedText.split("\n");
  
  markdownInput.focus();
  
  const isNumberedList = prefix.match(/^\d+\.\s/);
  const nonEmptyLines = lines.filter(line => line.trim() !== "");
  const allHaveNumbering = isNumberedList && nonEmptyLines.length > 0 && 
    nonEmptyLines.every(line => line.match(/^\d+\.\s/));
  const allHaveBullets = !isNumberedList && nonEmptyLines.length > 0 && 
    nonEmptyLines.every(line => line.startsWith(prefix));
  
  let newLines;
  if (allHaveNumbering || allHaveBullets) {
    newLines = lines.map(line => {
      if (isNumberedList) {
        return line.replace(/^\d+\.\s*/, "");
      } else {
        return line.startsWith(prefix) ? line.substring(prefix.length) : line;
      }
    });
  } else {
    let counter = 1;
    newLines = lines.map(line => {
      if (line.trim() === "") return line;
      const cleaned = line.replace(/^([-*+]|\d+\.)\s*/, "");
      if (isNumberedList) {
        const numbered = `${counter}. ${cleaned}`;
        counter++;
        return numbered;
      } else {
        return prefix + cleaned;
      }
    });
  }
  
  const newText = newLines.join("\n");
  markdownInput.setSelectionRange(firstLineStart, actualLastLineEnd);
  document.execCommand('insertText', false, newText);
  
  const newCursorPos = firstLineStart + newLines[0].length;
  markdownInput.setSelectionRange(newCursorPos, newCursorPos);
  scheduleRender();
}

function insertLink() {
  const { selectedText } = getSelection();
  if (selectedText) {
    const urlPattern = /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/i;
    if (urlPattern.test(selectedText.trim())) {
      replaceSelectionWithUndo(`[](${selectedText})`, -selectedText.length - 2);
    } else {
      replaceSelectionWithUndo(`[${selectedText}](url)`, -4);
    }
  } else {
    replaceSelectionWithUndo("[](url)", -5);
  }
}

function insertImage() {
  const { selectedText } = getSelection();
  if (selectedText) {
    const urlPattern = /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}|\.?\/)/i;
    if (urlPattern.test(selectedText.trim())) {
      replaceSelectionWithUndo(`![](${selectedText})`, -selectedText.length - 2);
    } else {
      replaceSelectionWithUndo(`![${selectedText}]()`, -1);
    }
  } else {
    replaceSelectionWithUndo("![]()", -1);
  }
}

function insertCodeBlock() {
  const { selectedText } = getSelection();
  if (selectedText) {
    replaceSelectionWithUndo("```\n" + selectedText + "\n```", 0);
  } else {
    replaceSelectionWithUndo("```\n\n```", -4);
  }
}

function insertInlineCode() {
  wrapSelection("`");
}

function insertInlineMath() {
  const { selectedText } = getSelection();
  if (selectedText) {
    replaceSelectionWithUndo(`$${selectedText}$`, 0);
  } else {
    replaceSelectionWithUndo("$$", -1);
  }
}

function insertBlockMath() {
  const { selectedText } = getSelection();
  if (selectedText) {
    replaceSelectionWithUndo(`$$\n${selectedText}\n$$`, 0);
  } else {
    replaceSelectionWithUndo("$$\n\n$$", -3);
  }
}

function initTemplates() {
  const container = document.getElementById("latex-template-options");
  if (!container || templateMenuInitialized) return;

  TEMPLATES.forEach((tpl) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "toolbar-template-item";
    item.dataset.templateId = tpl.id;
    item.title = tpl.description || tpl.label;
    item.textContent = tpl.label;
    item.addEventListener("click", () => {
      setLatexMode(true);
      const applied = applyTemplate(tpl.id, markdownInput, scheduleRender);
      if (!applied) return;

      activeTemplateId = tpl.id;
      window.activeTemplateId = activeTemplateId;
      setIeeeMode(Boolean(tpl.ieeeMode));
      closeTemplateMenu();
      syncTemplateButtonState();
    });
    container.appendChild(item);
  });

  document.addEventListener("click", handleTemplateMenuOutsideClick);
  document.addEventListener("keydown", handleTemplateMenuEscape);
  templateMenuInitialized = true;
}

function toggleLatexMode() {
  setLatexMode(!latexModeEnabled);
}

function toggleTemplateMenu(event) {
  event?.stopPropagation();
  if (!latexModeEnabled) return;

  const menu = document.getElementById("latex-template-options");
  if (!menu) return;

  if (!menu.classList.contains("hidden")) {
    closeTemplateMenu();
    return;
  }

  const button = document.getElementById("toolbar-template-picker");
  if (!button) return;

  menu.classList.remove("hidden");
  menu.style.visibility = "hidden";
  menu.style.left = "0px";
  menu.style.top = "0px";

  const rect = button.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 220;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
  const top = Math.min(window.innerHeight - 8, rect.bottom + 6);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
  button.classList.add("toolbar-btn--active");
  button.setAttribute("aria-expanded", "true");
}

function closeTemplateMenu() {
  const menu = document.getElementById("latex-template-options");
  const button = document.getElementById("toolbar-template-picker");
  if (!menu) return;
  menu.classList.add("hidden");
  menu.style.visibility = "";
  menu.style.left = "";
  menu.style.top = "";
  button?.classList.remove("toolbar-btn--active");
  button?.setAttribute("aria-expanded", "false");
}

function handleTemplateMenuOutsideClick(event) {
  const menu = document.getElementById("latex-template-options");
  const button = document.getElementById("toolbar-template-picker");
  if (!menu || menu.classList.contains("hidden")) return;
  if (menu.contains(event.target) || button?.contains(event.target)) return;
  closeTemplateMenu();
}

function handleTemplateMenuEscape(event) {
  if (event.key === "Escape") {
    closeTemplateMenu();
  }
}

function setLatexMode(enabled) {
  latexModeEnabled = Boolean(enabled);
  window.latexModeEnabled = latexModeEnabled;

  if (!latexModeEnabled) {
    ieeeModeEnabled = false;
    window.ieeeModeEnabled = false;
    activeTemplateId = null;
    window.activeTemplateId = null;
    closeTemplateMenu();
  }

  syncLatexModeUi();
  syncTemplateButtonState();
  scheduleRender();
}

function setIeeeMode(enabled) {
  ieeeModeEnabled = Boolean(enabled);
  window.ieeeModeEnabled = ieeeModeEnabled;
  scheduleRender();
}

function syncLatexModeUi() {
  const button = document.getElementById("toolbar-latex-templates");
  const group = document.getElementById("latex-toolbar-group");
  button?.classList.toggle("toolbar-btn--active", latexModeEnabled);
  group?.classList.toggle("hidden", !latexModeEnabled);
}

function syncTemplateButtonState() {
  document.querySelectorAll(".toolbar-template-item").forEach((button) => {
    button.classList.toggle("toolbar-template-item--active", button.dataset.templateId === activeTemplateId);
  });
}

function insertQuote() {
  const { start, text } = getSelection();
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start);
  const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
  const currentLine = text.substring(lineStart, actualLineEnd);
  
  markdownInput.focus();
  
  if (currentLine.startsWith("> ")) {
    const newLine = currentLine.substring(2);
    markdownInput.setSelectionRange(lineStart, actualLineEnd);
    document.execCommand('insertText', false, newLine);
    const newCursorPos = Math.max(lineStart, start - 2);
    markdownInput.setSelectionRange(newCursorPos, newCursorPos);
  } else {
    const newLine = "> " + currentLine;
    markdownInput.setSelectionRange(lineStart, actualLineEnd);
    document.execCommand('insertText', false, newLine);
    const newCursorPos = start + 2;
    markdownInput.setSelectionRange(newCursorPos, newCursorPos);
  }
  
  scheduleRender();
}

function duplicateLine() {
  const { start, text } = getSelection();
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start);
  const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
  const currentLine = text.substring(lineStart, actualLineEnd);
  
  markdownInput.focus();
  markdownInput.setSelectionRange(actualLineEnd, actualLineEnd);
  document.execCommand('insertText', false, "\n" + currentLine);
  markdownInput.setSelectionRange(actualLineEnd + 1, actualLineEnd + 1);
  scheduleRender();
}

function copyLine() {
  const { text, firstLineStart, actualLastLineEnd } = getSelectedLineRange();
  const linesToCopy = text.substring(firstLineStart, actualLastLineEnd);
  copyTextToClipboard(linesToCopy);
}

function handleEnterKey(e) {
  const { start, text } = getSelection();
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start);
  const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
  const currentLine = text.substring(lineStart, actualLineEnd);
  
  const numberedMatch = currentLine.match(/^(\d+)\.\s/);
  if (numberedMatch) {
    e.preventDefault();
    const currentNum = parseInt(numberedMatch[1], 10);
    const nextNum = currentNum + 1;
    const newPrefix = `${nextNum}. `;
    
    markdownInput.focus();
    document.execCommand('insertText', false, "\n" + newPrefix);
    scheduleRender();
    return;
  }
  
  const bulletMatch = currentLine.match(/^([-*+])\s/);
  if (bulletMatch) {
    e.preventDefault();
    const bullet = bulletMatch[1];
    const newPrefix = `${bullet} `;
    
    markdownInput.focus();
    document.execCommand('insertText', false, "\n" + newPrefix);
    scheduleRender();
    return;
  }
}

function removeLine() {
  const { text, firstLineStart, lastLineEnd, actualLastLineEnd } = getSelectedLineRange();
  const linesToCopy = text.substring(firstLineStart, actualLastLineEnd);
  copyTextToClipboard(linesToCopy);
  
  markdownInput.focus();
  
  if (lastLineEnd === -1) {
    if (firstLineStart === 0) {
      markdownInput.setSelectionRange(0, text.length);
    } else {
      markdownInput.setSelectionRange(firstLineStart - 1, text.length);
    }
  } else {
    markdownInput.setSelectionRange(firstLineStart, lastLineEnd + 1);
  }
  
  document.execCommand('delete');
  scheduleRender();
}
