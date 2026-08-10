/**
 * Renders authorship marks and live peer cursors over the textarea.
 *
 * Caret positions come from a hidden mirror of the textarea. Every input and
 * scroll schedules a redraw, so the mirror is written once per redraw and all
 * positions read back without touching it in between - one layout instead of
 * one per mark. Coordinates are cached per document text, so scrolling costs
 * no measuring at all.
 */
let _textarea = null;
let _localClientId = null;
let _gutterEl = null;
let _authorGutterEl = null;
let _overlayEl = null;
let _mirrorEl = null;
let _mirrorTextNode = null;
let _measureRange = null;
let _rafId = null;
let _peers = [];
let _resizeObserver = null;
let _lineAuthors = {};
const PEER_NAME_TRUNCATE_LEN = 8;
const MIRROR_TAIL = "\u200b";

/* Measurement caches, keyed on the text they came from. */
let _cacheText = null;
let _cacheStyleKey = "";
let _cacheCoords = new Map();
let _cacheLineStarts = null;
let _cacheLineStartsText = null;

function _onScroll() { _scheduleUpdate(); }
function _onInput() { _scheduleUpdate(); }

export function initCursorOverlay(textareaEl, localClientId) {
  destroyCursorOverlay();
  _textarea = textareaEl;
  _localClientId = localClientId;

  const wrapper = _textarea.parentElement;
  _authorGutterEl = _el("div", "author-gutter", wrapper);
  _gutterEl = _el("div", "peer-gutter", wrapper);
  _overlayEl = _el("div", "peer-cursor-overlay", wrapper);

  _mirrorEl = document.createElement("div");
  _mirrorEl.setAttribute("aria-hidden", "true");
  _mirrorEl.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;visibility:hidden;" +
    "white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;overflow:hidden;";
  _mirrorTextNode = document.createTextNode("");
  _mirrorEl.appendChild(_mirrorTextNode);
  document.body.appendChild(_mirrorEl);
  _measureRange = document.createRange();
  _invalidateMeasureCache();

  _textarea.addEventListener("scroll", _onScroll, { passive: true });
  _textarea.addEventListener("input", _onInput, { passive: true });

  _resizeObserver = new ResizeObserver(_scheduleUpdate);
  _resizeObserver.observe(_textarea);
  _scheduleUpdate();
}

export function updateCursorOverlay(peers) {
  _peers = Array.isArray(peers) ? peers : [];
  _scheduleUpdate();
}

export function setLocalColor(color) {}

export function updateLineAuthors(lineAuthorsMap) {
  _lineAuthors = lineAuthorsMap && typeof lineAuthorsMap === "object" ? lineAuthorsMap : {};
  _scheduleUpdate();
}

export function destroyCursorOverlay() {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_textarea) {
    _textarea.removeEventListener("scroll", _onScroll);
    _textarea.removeEventListener("input", _onInput);
  }
  if (_resizeObserver) {
    _resizeObserver.disconnect();
    _resizeObserver = null;
  }

  if (_authorGutterEl) { _authorGutterEl.remove(); _authorGutterEl = null; }
  if (_gutterEl) { _gutterEl.remove(); _gutterEl = null; }
  if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }
  if (_mirrorEl) { _mirrorEl.remove(); _mirrorEl = null; }

  _mirrorTextNode = null;
  _measureRange = null;
  _invalidateMeasureCache();
  _textarea = null;
  _localClientId = null;
  _peers = [];
  _lineAuthors = {};
}

function _scheduleUpdate() {
  if (_rafId !== null) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = null;
    _redraw();
  });
}

function _invalidateMeasureCache() {
  _cacheText = null;
  _cacheStyleKey = "";
  _cacheCoords = new Map();
  _cacheLineStarts = null;
  _cacheLineStartsText = null;
}

/* Offsets at which each 1-based line begins; index 0 holds line 1. */
function _lineStarts(text) {
  if (_cacheLineStartsText === text && _cacheLineStarts) return _cacheLineStarts;
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  _cacheLineStarts = starts;
  _cacheLineStartsText = text;
  return starts;
}

function _lineToOffset(text, line) {
  const starts = _lineStarts(text);
  if (line <= 1) return 0;
  if (line > starts.length) return text.length;
  return starts[line - 1];
}

/* 1-based line+column to char offset. */
function _lineColumnToOffset(text, line, column) {
  const lineStart = _lineToOffset(text, line);
  if (!Number.isFinite(Number(column)) || Number(column) <= 1) return lineStart;
  const nextLineStart = _lineToOffset(text, Number(line) + 1);
  const lineEndExclusive = nextLineStart > lineStart ? Math.max(lineStart, nextLineStart - 1) : text.length;
  const maxCharsOnLine = Math.max(0, lineEndExclusive - lineStart);
  const colIndex = Math.max(0, Math.min(maxCharsOnLine, Math.floor(Number(column)) - 1));
  return lineStart + colIndex;
}

/* Copies the textarea's text metrics onto the mirror. The returned key changes
   whenever something that affects wrapping does. */
function _syncMirror() {
  const cs = window.getComputedStyle(_textarea);
  const copy = [
    "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
    "line-height", "text-indent", "text-transform", "word-spacing",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "box-sizing"
  ].map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
  const styleKey = `${_textarea.clientWidth}|${copy}`;
  if (styleKey !== _cacheStyleKey) {
    _mirrorEl.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;visibility:hidden;" +
      "white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;overflow:hidden;" +
      `width:${_textarea.clientWidth}px;${copy}`;
    _cacheStyleKey = styleKey;
    _cacheCoords.clear();
  }
  return { styleKey, lineHeight: parseFloat(cs.lineHeight) || 20 };
}

/* Coordinates for every requested offset, relative to the mirror's top-left.
   One Range, reused, with no writes in between - so one layout however many
   offsets are asked for. */
function _measureOffsets(text, offsets) {
  const result = new Map();
  if (!_mirrorEl || !_mirrorTextNode || !_measureRange) return result;

  const pending = [];
  for (const offset of offsets) {
    if (_cacheText === text && _cacheCoords.has(offset)) {
      result.set(offset, _cacheCoords.get(offset));
    } else {
      pending.push(offset);
    }
  }
  if (pending.length === 0) return result;

  if (_cacheText !== text) {
    // Tail sentinel: gives end-of-document something to measure.
    _mirrorTextNode.nodeValue = `${text}${MIRROR_TAIL}`;
    _cacheText = text;
    _cacheCoords.clear();
  }

  const mirrorRect = _mirrorEl.getBoundingClientRect();
  const mirrorLength = _mirrorTextNode.nodeValue.length;
  for (const offset of pending) {
    const safe = Math.max(0, Math.min(offset, text.length));
    if (safe >= mirrorLength) continue;
    let rect = null;
    try {
      _measureRange.setStart(_mirrorTextNode, safe);
      _measureRange.setEnd(_mirrorTextNode, safe + 1);
      rect = _measureRange.getBoundingClientRect();
      // A range over a line break collapses to nothing, but the rect list
      // still knows where the break is.
      if (rect.height === 0 && rect.width === 0) {
        const rects = _measureRange.getClientRects();
        if (rects.length > 0) rect = rects[0];
      }
    } catch {
      rect = null;
    }
    if (!rect) continue;
    const coords = { top: rect.top - mirrorRect.top, left: rect.left - mirrorRect.left };
    _cacheCoords.set(offset, coords);
    result.set(offset, coords);
  }
  return result;
}

function _redraw() {
  if (!_textarea || !_authorGutterEl || !_gutterEl || !_overlayEl) return;
  // Hidden editor: nothing to measure, and the numbers would be stale anyway.
  // The ResizeObserver redraws once it is back.
  if (_textarea.offsetParent === null && _textarea.clientWidth === 0) return;

  const text = _textarea.value || "";
  const gutterEntries = _collectAuthorEntries(text);
  const cursorEntries = _collectCursorEntries(text);

  if (gutterEntries.length === 0 && cursorEntries.length === 0) {
    _authorGutterEl.replaceChildren();
    _gutterEl.replaceChildren();
    _overlayEl.replaceChildren();
    return;
  }

  const { lineHeight } = _syncMirror();

  const offsets = new Set();
  for (const entry of gutterEntries) {
    offsets.add(entry.startOffset);
    offsets.add(entry.endOffset);
  }
  for (const entry of cursorEntries) offsets.add(entry.offset);

  const coords = _measureOffsets(text, offsets);
  _renderAuthorshipGutter(gutterEntries, coords, lineHeight);
  _renderLiveCursors(cursorEntries, coords, lineHeight);
}

function _collectAuthorEntries(text) {
  const entries = [];
  const lineAuthors = _lineAuthors;
  for (const lineStr of Object.keys(lineAuthors)) {
    const line = parseInt(lineStr, 10);
    const info = lineAuthors[lineStr];
    if (!Number.isFinite(line) || line < 1 || !info?.color) continue;
    entries.push({ line, info });
  }
  if (entries.length === 0) return entries;
  entries.sort((a, b) => a.line - b.line);

  const totalLines = _lineStarts(text).length;
  const spans = [];
  for (let i = 0; i < entries.length; i += 1) {
    const current = entries[i];
    const next = entries[i + 1];
    const startLine = current.line;
    const endLine = Math.min(totalLines, Math.max(startLine, next ? next.line - 1 : totalLines));
    if (startLine > totalLines || endLine < startLine) continue;
    const startOffset = _lineToOffset(text, startLine);
    const endOffset = _lineToOffset(text, endLine + 1);
    spans.push({ info: current.info, startOffset, endOffset });
  }
  return spans;
}

function _collectCursorEntries(text) {
  const entries = [];
  for (const peer of _peers) {
    if (!peer || !peer.clientId || peer.clientId === _localClientId) continue;
    if (typeof peer.cursorLine !== "number" || peer.cursorLine <= 0) continue;
    entries.push({ peer, offset: _lineColumnToOffset(text, peer.cursorLine, peer.cursorColumn) });
  }
  return entries;
}

function _renderAuthorshipGutter(spans, coords, defaultLineHeight) {
  const scrollTop = _textarea.scrollTop;
  const viewportHeight = _textarea.clientHeight;
  const fragment = document.createDocumentFragment();

  for (const span of spans) {
    const startCoords = coords.get(span.startOffset);
    if (!startCoords) continue;
    const endCoords = span.endOffset > span.startOffset ? coords.get(span.endOffset) : null;
    const lineHeight = endCoords
      ? Math.max(defaultLineHeight, endCoords.top - startCoords.top)
      : defaultLineHeight;
    const top = startCoords.top - scrollTop;
    if (top + lineHeight < 0 || top > viewportHeight + defaultLineHeight) continue;

    const name = _resolveAuthorName(span.info);
    const mark = document.createElement("div");
    mark.className = "author-gutter-mark";
    mark.style.cssText = `top:${top}px;height:${lineHeight}px;background:${span.info.color};--peer-color:${span.info.color};`;
    mark.dataset.peerName = name;
    mark.title = name;
    fragment.appendChild(mark);
  }
  _authorGutterEl.replaceChildren(fragment);
}

function _renderLiveCursors(entries, coords, defaultLineHeight) {
  const scrollTop = _textarea.scrollTop;
  const scrollLeft = _textarea.scrollLeft;
  const viewportHeight = _textarea.clientHeight;
  const fragment = document.createDocumentFragment();

  for (const { peer, offset } of entries) {
    const position = coords.get(offset);
    if (!position) continue;

    const top = position.top - scrollTop;
    if (top < -defaultLineHeight || top > viewportHeight + defaultLineHeight) continue;

    const color = peer.color || _hsl(peer.clientId);
    const name = peer.name || _trunc(peer.clientId, PEER_NAME_TRUNCATE_LEN);
    const idle = peer.isTyping === false;

    const chip = document.createElement("div");
    chip.className = idle ? "peer-cursor-chip idle" : "peer-cursor-chip";
    chip.style.cssText =
      `top:${top}px;left:${Math.max(0, position.left - scrollLeft - 4)}px;` +
      `height:${defaultLineHeight}px;--peer-color:${color};`;
    chip.dataset.peerName = name;
    chip.title = name;
    fragment.appendChild(chip);
  }
  _gutterEl.replaceChildren();
  _overlayEl.replaceChildren(fragment);
}

function _trunc(s, n) {
  return !s ? "" : s.length <= n ? s : `${s.slice(0, n)}...`;
}

function _hsl(id) {
  if (!id) return "#888";
  const source = String(id || "peer");
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function _el(tag, id, parent) {
  const el = document.createElement(tag);
  el.id = id;
  parent.appendChild(el);
  return el;
}

function _resolveAuthorName(info) {
  if (info?.name && String(info.name).trim()) return String(info.name).trim();
  if (info?.color) {
    const matched = _peers.find((p) => p && p.color === info.color && p.name);
    if (matched?.name) return String(matched.name).trim();
  }
  return "Peer";
}
