import { markdownInput, markdownPreview, slidesPreview, viewSlidesButton, fullPreviewButton, loadingSpinner, backdrop } from "./common.js";

let md = null;
let renderTimer = null;
let ieeeResizeRenderTimer = null;
let ieeeResizeBound = false;
const IEEE_PREVIEW_SMALL_SCREEN_MAX = 1450;
const IEEE_PREVIEW_SMALL_SCALE = 0.85;
const IEEE_PREVIEW_LARGE_SCALE = 1;
const IEEE_PREVIEW_MIN_SCALE = 0.55;
const IEEE_PREVIEW_SCALE_SAFETY = 0.985;
const IEEE_PREVIEW_VISUAL_GAP_PX = 10;

const RENDER_DEBOUNCE_MS = 120;
const RENDER_DEBOUNCE_SLOW_MS = 300;
const RENDER_SLOW_THRESHOLD_MS = 60;
// Repagination measures every block, so it waits for a typing pause and then
// runs in short slices instead of blocking the editor.
const IEEE_REPAGINATE_IDLE_MS = 220;
const IEEE_REPAGINATE_FAST_LIMIT_MS = 40;
const IEEE_PAGINATE_SLICE_MS = 10;
// Wrapper that keeps staged pages in the document but out of sight. The height
// cap belongs here, not on the stack: the stack is a column flex box, and
// capping it would squash the very pages being measured.
const IEEE_STAGING_STYLE = "height:0;overflow:hidden;visibility:hidden;pointer-events:none;";
// Backstop, so a block that somehow never fits can't spin forever.
const IEEE_MAX_PAGES = 2000;
const SLIDE_MARKER_RE = /^---$|^<!-- slide -->$/m;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

let lastRenderDurationMs = 0;

function scheduleIeeeRepaginationFromResize() {
  if (ieeeResizeRenderTimer) clearTimeout(ieeeResizeRenderTimer);
  ieeeResizeRenderTimer = setTimeout(() => {
    if (!markdownPreview.classList.contains("markdown-preview--ieee")) return;
    if (!(window.latexModeEnabled && window.ieeeModeEnabled)) return;
    repaginateIeeePreview(markdownInput.value || "");
  }, 120);
}

function applyIeeePreviewViewportFit() {
  const preview = markdownPreview;
  if (!preview.classList.contains("markdown-preview--ieee")) return;

  const pages = Array.from(preview.querySelectorAll(".ieee-preview-page"));
  if (pages.length === 0) return;

  const isSmallScreen = window.innerWidth <= IEEE_PREVIEW_SMALL_SCREEN_MAX;
  const targetScale = isSmallScreen ? IEEE_PREVIEW_SMALL_SCALE : IEEE_PREVIEW_LARGE_SCALE;
  const previewComputed = window.getComputedStyle(preview);
  const paddingLeft = parseFloat(previewComputed.paddingLeft) || 0;
  const paddingRight = parseFloat(previewComputed.paddingRight) || 0;
  const availableWidth = preview.clientWidth - paddingLeft - paddingRight;

  const naturalPageWidth = pages[0].offsetWidth || 794;
  const naturalPageHeight = pages[0].offsetHeight || 1123;
  const fitCap = (availableWidth / naturalPageWidth) * IEEE_PREVIEW_SCALE_SAFETY;
  const fitScale = Math.max(IEEE_PREVIEW_MIN_SCALE, Math.min(targetScale, fitCap, 1));
  preview.style.setProperty("--ieee-fit-scale", fitScale.toFixed(4));

  const adjustedMarginBottom = (fitScale - 1) * naturalPageHeight + IEEE_PREVIEW_VISUAL_GAP_PX;
  pages.forEach((page, index) => {
    page.style.marginBottom = index === pages.length - 1 ? "0px" : `${adjustedMarginBottom}px`;
  });

  preview.scrollLeft = 0;
}

export function initMarkdown() {
  try {
    md = window.markdownit({
      html: false,
      linkify: true,
      breaks: true
    });

    // Register KaTeX plugin for $...$ inline and $$...$$ block math
    if (typeof window.markdownItKatex === "function") {
      md.use(window.markdownItKatex);
    }

    const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      const aIndex = tokens[idx].attrIndex("target");
      if (aIndex < 0) {
        tokens[idx].attrPush(["target", "_blank"]);
      } else {
        tokens[idx].attrs[aIndex][1] = "_blank";
      }
      const relIndex = tokens[idx].attrIndex("rel");
      if (relIndex < 0) {
        tokens[idx].attrPush(["rel", "noopener noreferrer"]);
      } else {
        tokens[idx].attrs[relIndex][1] = "noopener noreferrer";
      }
      return defaultRender(tokens, idx, options, env, self);
    };

    resetIncrementalPreview();
    renderPreview();
    if (!ieeeResizeBound) {
      window.addEventListener("resize", scheduleIeeeRepaginationFromResize);
      ieeeResizeBound = true;
    }
    if (!scrollSyncBound) {
      markdownInput.addEventListener("scroll", requestScrollSync, { passive: true });
      scrollSyncBound = true;
    }
  } catch {
    md = null;
    markdownPreview.textContent = markdownInput.value || "";
  }
}

/* Hides comment content but keeps its newlines, so token line numbers still
   line up with the editor's lines. */
function stripHtmlComments(markdown) {
  return (markdown || "").replace(HTML_COMMENT_RE, (comment) => comment.replace(/[^\n]/g, ""));
}

export function renderMarkdown(markdown) {
  if (!md) return markdown || "";
  return md.render(stripHtmlComments(markdown));
}

/* Incremental preview rendering.
 *
 * Re-rendering the whole document per keystroke means a full markdown pass, a
 * full KaTeX pass and a full DOM rebuild - hundreds of ms once the document
 * grows. So: split the tokens into top-level blocks, cache each block's HTML
 * under its own source, and only re-render and patch the ones that changed.
 * An edit usually touches one block, so cost stops tracking document length. */

// Rendered HTML for the current document's blocks, keyed by block source.
let blockHtmlCache = new Map();
// Blocks currently in the DOM: { key, nodes, startLine, endLine }, in order.
let previewBlocks = [];
let previewNeedsFullRender = true;
let lastPreviewSource = null;

function resetIncrementalPreview() {
  previewBlocks = [];
  previewNeedsFullRender = true;
  lastPreviewSource = null;
}

/* Splits a flat token stream into top-level blocks. */
function groupTopLevelTokens(tokens) {
  const groups = [];
  let current = null;
  let depth = 0;

  for (const token of tokens) {
    if (!current) current = [];
    current.push(token);
    depth += token.nesting;
    if (depth <= 0) {
      groups.push(current);
      current = null;
      depth = 0;
    }
  }
  if (current) groups.push(current);
  return groups;
}

/* A block's HTML depends on its own source plus the document's link reference
   definitions, so both go in the key. Blocks with no source map fall back to a
   signature off their tokens - slower to build, but never wrong. */
function blockCacheKey(group, srcLines, envKey) {
  const first = group[0];
  const map = first?.map;
  if (Array.isArray(map) && Number.isInteger(map[0]) && Number.isInteger(map[1]) && map[1] > map[0]) {
    return `${envKey}\u0000${srcLines.slice(map[0], map[1]).join("\n")}`;
  }
  let signature = `${envKey}\u0000nomap`;
  for (const token of group) {
    signature += `\u0000${token.type}|${token.tag}|${token.markup}|${token.info}|${token.content}`;
  }
  return signature;
}

function htmlToNodes(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const nodes = [];
  for (const node of Array.from(template.content.childNodes)) {
    // markdown-it separates blocks with newlines; they render as nothing and
    // only complicate the node bookkeeping.
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length === 0) continue;
    nodes.push(node);
  }
  return nodes;
}

/* True when the DOM still holds exactly what we last rendered. Anything else
   (slides, IEEE pages, outside writes) means rebuild from scratch. */
function previewDomMatchesBlocks() {
  let expected = 0;
  for (const block of previewBlocks) {
    for (const node of block.nodes) {
      if (node.parentNode !== markdownPreview) return false;
      expected += 1;
    }
  }
  return markdownPreview.childNodes.length === expected;
}

function renderPreviewIncremental(markdown) {
  // Plenty of callers re-render without the text having changed (mode toggles,
  // peer updates, reconnects). Nothing to do for those.
  if (!previewNeedsFullRender && lastPreviewSource === markdown && previewDomMatchesBlocks()) {
    return;
  }

  const src = stripHtmlComments(markdown);
  const env = {};
  const tokens = md.parse(src, env);
  const envKey = env.references ? JSON.stringify(env.references) : "";
  const srcLines = src.split("\n");
  const groups = groupTopLevelTokens(tokens);

  const nextCache = new Map();
  let lineCursor = 0;
  const nextBlocks = groups.map((group) => {
    const key = blockCacheKey(group, srcLines, envKey);
    let html = nextCache.get(key);
    if (html === undefined) {
      html = blockHtmlCache.get(key);
      if (html === undefined) html = md.renderer.render(group, md.options, env);
      nextCache.set(key, html);
    }
    // Source line range, for lining the preview up with the editor.
    const map = group[0]?.map;
    const startLine = Array.isArray(map) ? map[0] : lineCursor;
    const endLine = Array.isArray(map) ? map[1] : startLine + 1;
    lineCursor = endLine;
    return { key, html, nodes: null, startLine, endLine };
  });
  blockHtmlCache = nextCache;

  if (previewNeedsFullRender || !previewDomMatchesBlocks()) {
    const fragment = document.createDocumentFragment();
    for (const block of nextBlocks) {
      block.nodes = htmlToNodes(block.html);
      for (const node of block.nodes) fragment.appendChild(node);
    }
    markdownPreview.replaceChildren(fragment);
  } else {
    patchPreviewBlocks(nextBlocks);
  }

  previewBlocks = nextBlocks.map((block) => ({
    key: block.key,
    nodes: block.nodes || [],
    startLine: block.startLine,
    endLine: block.endLine
  }));
  previewNeedsFullRender = false;
  lastPreviewSource = markdown;
}

/* Replaces only the run of blocks between the unchanged head and tail. */
function patchPreviewBlocks(nextBlocks) {
  const oldBlocks = previewBlocks;
  const oldLen = oldBlocks.length;
  const newLen = nextBlocks.length;

  let head = 0;
  while (head < oldLen && head < newLen && oldBlocks[head].key === nextBlocks[head].key) head += 1;

  let tail = 0;
  while (
    tail < oldLen - head &&
    tail < newLen - head &&
    oldBlocks[oldLen - 1 - tail].key === nextBlocks[newLen - 1 - tail].key
  ) {
    tail += 1;
  }

  for (let i = 0; i < head; i += 1) nextBlocks[i].nodes = oldBlocks[i].nodes;
  for (let i = 0; i < tail; i += 1) nextBlocks[newLen - 1 - i].nodes = oldBlocks[oldLen - 1 - i].nodes;

  let anchor = null;
  for (let i = oldLen - tail; i < oldLen && !anchor; i += 1) {
    anchor = oldBlocks[i].nodes[0] || null;
  }

  for (let i = head; i < oldLen - tail; i += 1) {
    for (const node of oldBlocks[i].nodes) node.remove();
  }

  const fragment = document.createDocumentFragment();
  for (let i = head; i < newLen - tail; i += 1) {
    nextBlocks[i].nodes = htmlToNodes(nextBlocks[i].html);
    for (const node of nextBlocks[i].nodes) fragment.appendChild(node);
  }
  if (fragment.childNodes.length > 0) markdownPreview.insertBefore(fragment, anchor);
}

/* Scroll sync.
 *
 * The preview follows the editor: whatever line sits at the top of the
 * textarea, the matching block sits at the top of the preview. Finding that
 * line needs the editor's wrapped line positions, which only the browser
 * knows, so they are measured in a hidden copy of the textarea - binary
 * search, so a handful of reads whatever the document length. Paginated and
 * slide views have no line map, so those fall back to plain proportion. */
const SYNC_MIRROR_BASE_STYLE =
  "position:fixed;top:-9999px;left:-9999px;visibility:hidden;" +
  "white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;overflow:hidden;";
const SYNC_MIRROR_PROPS = [
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
  "line-height", "text-indent", "text-transform", "word-spacing",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "box-sizing"
];

let scrollSyncBound = false;
let scrollSyncFrame = null;
let syncMirrorEl = null;
let syncMirrorTextNode = null;
let syncRange = null;
let syncMirrorText = null;
let syncMirrorStyleKey = "";
let syncLineStarts = null;
let syncLineStartsText = null;

function requestScrollSync() {
  if (scrollSyncFrame !== null) return;
  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = null;
    syncPreviewToEditor();
  });
}

function prepareSyncMirror(text) {
  if (!syncMirrorEl) {
    syncMirrorEl = document.createElement("div");
    syncMirrorEl.setAttribute("aria-hidden", "true");
    syncMirrorTextNode = document.createTextNode("");
    syncMirrorEl.appendChild(syncMirrorTextNode);
    document.body.appendChild(syncMirrorEl);
    syncRange = document.createRange();
    syncMirrorText = null;
    syncMirrorStyleKey = "";
  }

  const cs = window.getComputedStyle(markdownInput);
  const copy = SYNC_MIRROR_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
  const styleKey = `${markdownInput.clientWidth}|${copy}`;
  if (styleKey !== syncMirrorStyleKey) {
    syncMirrorEl.style.cssText = `${SYNC_MIRROR_BASE_STYLE}width:${markdownInput.clientWidth}px;${copy}`;
    syncMirrorStyleKey = styleKey;
  }
  if (syncMirrorText !== text) {
    syncMirrorTextNode.nodeValue = `${text}\u200b`;
    syncMirrorText = text;
  }
  return parseFloat(cs.lineHeight) || 20;
}

function syncLineStartsFor(text) {
  if (syncLineStartsText === text && syncLineStarts) return syncLineStarts;
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  syncLineStarts = starts;
  syncLineStartsText = text;
  return starts;
}

/* Top of a character offset, in the mirror's own coordinates. */
function offsetTopInMirror(offset) {
  syncRange.setStart(syncMirrorTextNode, offset);
  syncRange.setEnd(syncMirrorTextNode, offset + 1);
  let rect = syncRange.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) {
    const rects = syncRange.getClientRects();
    if (rects.length > 0) rect = rects[0];
  }
  return rect.top;
}

/* Which source line the editor has scrolled to, plus how far into it. The
   fraction is what carries wrapping: a line that wraps over many visual rows
   is tall, and scrolling through those rows walks the fraction from 0 to 1. */
function editorTopLine(text, lineHeight) {
  const starts = syncLineStartsFor(text);
  const firstTop = offsetTopInMirror(0);
  const target = markdownInput.scrollTop;
  const topOf = (line) => offsetTopInMirror(starts[line]) - firstTop;

  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (topOf(mid) <= target) low = mid;
    else high = mid - 1;
  }

  const lineTop = topOf(low);
  // The last line has no next line to measure against - and a document that is
  // one long wrapped line has none at all - so fall back to the end of the
  // text, or scrolling inside that line would move nothing.
  const nextTop = low + 1 < starts.length
    ? topOf(low + 1)
    : offsetTopInMirror(text.length) - firstTop + lineHeight;
  const height = nextTop - lineTop;
  const fraction = height > 0 ? Math.min(1, Math.max(0, (target - lineTop) / height)) : 0;
  return { line: low, fraction };
}

function blockEdgeInPreview(block, previewTop, edge) {
  const nodes = block.nodes.filter((n) => n.nodeType === Node.ELEMENT_NODE);
  const node = edge === "bottom" ? nodes[nodes.length - 1] : nodes[0];
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return (edge === "bottom" ? rect.bottom : rect.top) - previewTop + markdownPreview.scrollTop;
}

function syncPreviewProportionally() {
  const editorRange = markdownInput.scrollHeight - markdownInput.clientHeight;
  const previewRange = markdownPreview.scrollHeight - markdownPreview.clientHeight;
  if (editorRange <= 0 || previewRange <= 0) return;
  markdownPreview.scrollTop = (markdownInput.scrollTop / editorRange) * previewRange;
}

function syncPreviewToEditor() {
  if (!markdownPreview.clientHeight || markdownPreview.classList.contains("hidden")) return;
  if (markdownPreview.scrollHeight - markdownPreview.clientHeight <= 0) return;

  // Pages and slides carry no line map; proportion is the best available.
  if (previewBlocks.length === 0 || markdownPreview.classList.contains("markdown-preview--ieee")) {
    syncPreviewProportionally();
    return;
  }

  const text = markdownInput.value || "";
  let target = null;
  try {
    const lineHeight = prepareSyncMirror(text);
    const { line, fraction } = editorTopLine(text, lineHeight);

    let low = 0;
    let high = previewBlocks.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (previewBlocks[mid].startLine <= line) low = mid;
      else high = mid - 1;
    }

    const block = previewBlocks[low];
    const previewTop = markdownPreview.getBoundingClientRect().top;
    const blockTop = blockEdgeInPreview(block, previewTop, "top");
    if (blockTop !== null) {
      const next = previewBlocks[low + 1];
      const nextTop = next
        ? blockEdgeInPreview(next, previewTop, "top")
        : blockEdgeInPreview(block, previewTop, "bottom");
      const span = Math.max(1, block.endLine - block.startLine);
      const into = Math.min(1, Math.max(0, (line - block.startLine + fraction) / span));
      target = blockTop + ((nextTop ?? blockTop) - blockTop) * into;
    }
  } catch {
    target = null;
  }

  if (target === null) {
    syncPreviewProportionally();
    return;
  }
  const max = markdownPreview.scrollHeight - markdownPreview.clientHeight;
  markdownPreview.scrollTop = Math.min(max, Math.max(0, target));
}

function isHeadingNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(node.tagName);
}

function hasMeaningfulContent(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.trim().length > 0;
  }
  return true;
}

function findAbstractHeadingIndex(nodes, startIndex) {
  return nodes.findIndex((node, index) => {
    if (index < startIndex || !isHeadingNode(node)) return false;
    return node.textContent.trim().toLowerCase() === "abstract";
  });
}

function buildAbstractBlock(headingNode, bodyNodes) {
  const abstract = document.createElement("section");
  abstract.className = "ieee-abstract-block";

  headingNode.classList.add("ieee-abstract-heading");
  abstract.appendChild(headingNode);

  bodyNodes.forEach((node) => abstract.appendChild(node));
  return abstract;
}

function collapseParagraphLineBreaks(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

  const paragraphs = [];
  if (node.tagName === "P") {
    paragraphs.push(node);
  }
  node.querySelectorAll("p").forEach((p) => paragraphs.push(p));

  paragraphs.forEach((p) => {
    p.innerHTML = p.innerHTML
      .replace(/<br\s*\/?>\s*/gi, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  });
}

function splitParagraphNodeAtBreaks(node) {
  if (node?.nodeType !== Node.ELEMENT_NODE || node.tagName !== "P") return null;

  const parts = node.innerHTML
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.length > 0 ? parts : null;
}

function buildAuthorsBlock(authorNodes) {
  const meaningfulNodes = authorNodes.filter(hasMeaningfulContent);
  if (meaningfulNodes.length === 0) return null;

  const authors = document.createElement("div");
  authors.className = "ieee-authors";

  const grid = document.createElement("div");
  grid.className = "ieee-authors-grid";

  const rows = [];
  let authorCount = 0;

  meaningfulNodes.forEach((node) => {
    const parts = splitParagraphNodeAtBreaks(node);
    if (parts && parts.length > 0) {
      rows.push(parts);
      authorCount = Math.max(authorCount, parts.length);
      return;
    }

    const text = node.textContent?.trim();
    if (!text) return;
    rows.push([text]);
    authorCount = Math.max(authorCount, 1);
  });

  if (authorCount === 0) return null;

  if (authorCount <= 4) {
    grid.classList.add(`ieee-authors-grid--${authorCount}`);
  }

  const columns = Array.from({ length: authorCount }, () => {
    const col = document.createElement("div");
    col.className = "ieee-author-col";
    return col;
  });

  rows.forEach((parts) => {
    for (let i = 0; i < authorCount; i++) {
      const content = parts[i];
      if (!content) continue;
      const p = document.createElement("p");
      p.innerHTML = content;
      columns[i].appendChild(p);
    }
  });

  columns.forEach((col) => {
    if (col.childElementCount > 0) {
      grid.appendChild(col);
    }
  });

  authors.appendChild(grid);

  return authors;
}

function processFigureCaptions(container) {
  // Images: alt text becomes the caption (only when img is sole child of <p>)
  const images = Array.from(container.querySelectorAll("p > img:only-child"));
  images.forEach((img) => {
    const parentP = img.parentElement;
    if (!parentP || parentP.tagName !== "P") return;
    if (parentP.childNodes.length !== 1) return;
    const alt = img.getAttribute("alt");
    if (!alt) return;
    const figure = document.createElement("figure");
    figure.appendChild(img.cloneNode(true));
    const caption = document.createElement("figcaption");
    caption.className = "ieee-figure-caption";
    caption.textContent = alt;
    figure.appendChild(caption);
    parentP.replaceWith(figure);
  });

  // Code blocks: italic paragraph immediately after becomes the caption
  const pres = Array.from(container.querySelectorAll("pre"));
  pres.forEach((pre) => {
    const next = pre.nextElementSibling;
    if (!next || next.tagName !== "P") return;
    const em = next.querySelector("em");
    if (!em || next.childElementCount !== 1 || next.textContent.trim() !== em.textContent.trim()) return;
    const figure = document.createElement("figure");
    pre.replaceWith(figure);
    figure.appendChild(pre);
    const caption = document.createElement("figcaption");
    caption.className = "ieee-figure-caption";
    caption.textContent = em.textContent;
    figure.appendChild(caption);
    next.remove();
  });
}

function isBibliographicHref(href) {
  if (!href) return false;
  // Autolinked author emails become mailto: and must not become citations.
  if (/^mailto:/i.test(href)) return false;
  // Only treat web URLs as auto-references (skip anchors, relative paths, etc.).
  return /^https?:\/\//i.test(href);
}

function processReferenceLinks(container) {
  const links = Array.from(container.querySelectorAll("a"));
  const refMap = new Map();
  let refCounter = 0;
  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!isBibliographicHref(href)) return;
    const text = link.textContent.trim();
    if (text.match(/^\[\d+\]$/)) return;
    // Skip auto-linked URLs (bare URLs that markdown-it linkified)
    if (text === href || text === href.replace(/\/$/, "")) return;
    if (!refMap.has(href)) {
      refCounter++;
      refMap.set(href, refCounter);
    }
    const refNum = refMap.get(href);
    const sup = document.createElement("sup");
    const refLink = document.createElement("a");
    refLink.href = `#ieee-ref-${refNum}`;
    refLink.textContent = `[${refNum}]`;
    sup.appendChild(refLink);
    link.after(sup);
  });
  if (refMap.size > 0) {
    const refSection = document.createElement("div");
    const refHeading = document.createElement("h2");
    refHeading.textContent = "References";
    refSection.appendChild(refHeading);
    const refList = document.createElement("ol");
    refList.className = "ieee-reference-list";
    refMap.forEach((num, href) => {
      const li = document.createElement("li");
      li.id = `ieee-ref-${num}`;
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = href;
      li.appendChild(document.createTextNode(`[${num}] `));
      li.appendChild(a);
      refList.appendChild(li);
    });
    refSection.appendChild(refList);
    container.appendChild(refSection);
  }
}

function buildIeeeLayoutHtml(renderedHtml, markdown) {
  const host = document.createElement("div");
  host.innerHTML = renderedHtml || "";

  processFigureCaptions(host);
  processReferenceLinks(host);

  const nodes = Array.from(host.childNodes);
  const titleIndex = nodes.findIndex(isHeadingNode);

  // If no heading exists, keep all content in two-column flow without structural assumptions.
  if (titleIndex === -1) {
    return `<div class="ieee-paper-layout"><section class="ieee-columns">${renderedHtml || ""}</section></div>`;
  }

  const titleNode = nodes[titleIndex];
  const abstractIndex = findAbstractHeadingIndex(nodes, titleIndex + 1);
  const nextHeadingAfterAbstract = abstractIndex === -1
    ? -1
    : nodes.findIndex((node, index) => index > abstractIndex && isHeadingNode(node));

  const authorsEnd = abstractIndex !== -1 ? abstractIndex : titleIndex + 1;
  const authorNodes = nodes.slice(titleIndex + 1, authorsEnd);

  const abstractHeadingNode = abstractIndex === -1 ? null : nodes[abstractIndex];
  const abstractBodyNodes = abstractIndex === -1
    ? []
    : nodes.slice(abstractIndex + 1, nextHeadingAfterAbstract === -1 ? nodes.length : nextHeadingAfterAbstract);

  const remainderStart = abstractIndex !== -1
    ? (nextHeadingAfterAbstract === -1 ? nodes.length : nextHeadingAfterAbstract)
    : (titleIndex + 1);
  const remainderNodes = [...nodes.slice(0, titleIndex), ...nodes.slice(remainderStart)];

  // Keep author/frontmatter line breaks intact, but collapse manual hard wraps in paper body.
  abstractBodyNodes.forEach(collapseParagraphLineBreaks);
  remainderNodes.forEach(collapseParagraphLineBreaks);

  const layout = document.createElement("div");
  layout.className = "ieee-paper-layout";

  const frontmatter = document.createElement("section");
  frontmatter.className = "ieee-frontmatter";

  titleNode.classList.add("ieee-title");
  frontmatter.appendChild(titleNode);

  const authors = buildAuthorsBlock(authorNodes);
  if (authors) {
    frontmatter.appendChild(authors);
  }

  layout.appendChild(frontmatter);

  const columns = document.createElement("section");
  columns.className = "ieee-columns";

  if (abstractHeadingNode) {
    const abstractBlock = buildAbstractBlock(abstractHeadingNode, abstractBodyNodes);
    columns.appendChild(abstractBlock);
  }

  remainderNodes.forEach((node) => columns.appendChild(node));
  layout.appendChild(columns);

  return layout.outerHTML;
}

function shouldKeepPreviewNode(node) {
  if (node.nodeType === Node.ELEMENT_NODE) return true;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim().length > 0;
  return false;
}

function createIeeePreviewPage(frontmatterNode = null) {
  const page = document.createElement("section");
  page.className = "ieee-preview-page";

  const inner = document.createElement("div");
  inner.className = "ieee-preview-page-inner";
  page.appendChild(inner);

  if (frontmatterNode) {
    inner.appendChild(frontmatterNode);
  }

  const columns = document.createElement("section");
  columns.className = "ieee-columns ieee-preview-columns";
  inner.appendChild(columns);

  return { page, inner, columns };
}

function cloneAttributes(fromEl, toEl) {
  Array.from(fromEl.attributes).forEach((attr) => {
    toEl.setAttribute(attr.name, attr.value);
  });
}

function splitParagraphNodeToFit(pageInnerEl, columnsEl, paragraphNode) {
  if (!paragraphNode || paragraphNode.nodeType !== Node.ELEMENT_NODE || paragraphNode.tagName !== "P") {
    return null;
  }

  const text = (paragraphNode.textContent || "").trim();
  if (!text) return null;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  let low = 1;
  let high = words.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const probe = document.createElement("p");
    cloneAttributes(paragraphNode, probe);
    probe.textContent = words.slice(0, mid).join(" ");

    columnsEl.appendChild(probe);
    const fits = !hasPageOverflow(pageInnerEl, columnsEl, probe);
    columnsEl.removeChild(probe);

    if (fits) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best <= 0 || best >= words.length) return null;

  const fitNode = document.createElement("p");
  cloneAttributes(paragraphNode, fitNode);
  fitNode.textContent = words.slice(0, best).join(" ");

  const remainingNode = document.createElement("p");
  cloneAttributes(paragraphNode, remainingNode);
  remainingNode.textContent = words.slice(best).join(" ");

  return { fitNode, remainingNode };
}

function hasPageOverflow(pageInnerEl, columnsEl, appendedNode) {
  const colsRect = columnsEl.getBoundingClientRect();

  const tailProbe = document.createElement("span");
  tailProbe.style.display = "inline-block";
  tailProbe.style.width = "0";
  tailProbe.style.height = "0";
  tailProbe.style.margin = "0";
  tailProbe.style.padding = "0";
  tailProbe.style.border = "0";
  tailProbe.style.lineHeight = "0";
  tailProbe.style.fontSize = "0";
  tailProbe.textContent = "\u200b";
  columnsEl.appendChild(tailProbe);

  // All reads happen before the probe is removed, so this costs one layout
  // per call instead of two.
  const probeRect = tailProbe.getBoundingClientRect();
  const overflowByInnerHeight = pageInnerEl.scrollHeight - pageInnerEl.clientHeight > 1;
  const overflowByColumnHeight = columnsEl.scrollHeight - columnsEl.clientHeight > 1;
  const overflowByColumns = columnsEl.scrollWidth - columnsEl.clientWidth > 1;

  let overflowByGeometry = false;
  if (appendedNode?.nodeType === Node.ELEMENT_NODE) {
    const rects = Array.from(appendedNode.getClientRects());
    if (rects.length > 0) {
      const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
      const maxRight = Math.max(...rects.map((rect) => rect.right));
      overflowByGeometry = maxBottom > colsRect.bottom + 0.5 || maxRight > colsRect.right + 0.5;
    }
  }

  const overflowByProbe = probeRect.bottom > colsRect.bottom + 0.5 || probeRect.right > colsRect.right + 0.5;
  tailProbe.remove();

  return overflowByProbe || overflowByInnerHeight || overflowByColumnHeight || overflowByColumns || overflowByGeometry;
}

/* IEEE pagination.
 *
 * Placing a block needs a layout read, so a long paper is expensive no matter
 * what. Run it in short slices that yield in between, and give every run a
 * token so a newer edit or resize drops the old one instead of queueing. */
let ieeeRunToken = 0;
let ieeeRepaginateTimer = null;
let ieeeHtmlCacheSource = null;
let ieeeHtmlCacheValue = "";
let ieeeFontsWatched = false;
let lastPaginateDurationMs = 0;

/* Gives the event loop back between slices so typing stays responsive. Not
   rAF: frame callbacks stop in a hidden window, which would strand a
   half-paginated preview until it came back. */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

function getIeeeLayoutHtml(markdown) {
  const source = markdown || "";
  if (ieeeHtmlCacheSource === source) return ieeeHtmlCacheValue;
  const html = renderDocument(source, { ieeeLayout: true });
  ieeeHtmlCacheSource = source;
  ieeeHtmlCacheValue = html;
  return html;
}

async function paginateIeeePreview(runToken, layout, stack) {
  if (!layout) return false;

  const frontmatter = layout.querySelector(":scope > .ieee-frontmatter");
  const columns = layout.querySelector(":scope > .ieee-columns");
  if (!columns) return false;

  const blocks = Array.from(columns.childNodes).filter(shouldKeepPreviewNode);

  const first = createIeeePreviewPage(frontmatter ? frontmatter.cloneNode(true) : null);
  stack.appendChild(first.page);

  let currentInner = first.inner;
  let currentColumns = first.columns;
  let sliceStart = performance.now();

  for (const block of blocks) {
    if (runToken !== ieeeRunToken) return false;

    let nodeToPlace = block.cloneNode(true);
    while (nodeToPlace) {
      // One long paragraph can span many pages, and each break costs a binary
      // search over its words - so check the budget here, not just per block.
      if (performance.now() - sliceStart > IEEE_PAGINATE_SLICE_MS) {
        await yieldToEventLoop();
        if (runToken !== ieeeRunToken) return false;
        sliceStart = performance.now();
      }

      currentColumns.appendChild(nodeToPlace);
      if (!hasPageOverflow(currentInner, currentColumns, nodeToPlace)) {
        nodeToPlace = null;
        break;
      }

      currentColumns.removeChild(nodeToPlace);

      const split = splitParagraphNodeToFit(currentInner, currentColumns, nodeToPlace);
      if (split) {
        currentColumns.appendChild(split.fitNode);
        nodeToPlace = split.remainingNode;
      }

      if (!split && currentColumns.childNodes.length === 0) {
        currentColumns.appendChild(nodeToPlace);
        nodeToPlace = null;
        break;
      }

      if (stack.childElementCount >= IEEE_MAX_PAGES) return false;

      const nextPage = createIeeePreviewPage();
      stack.appendChild(nextPage.page);
      currentInner = nextPage.inner;
      currentColumns = nextPage.columns;
    }

    if (performance.now() - sliceStart > IEEE_PAGINATE_SLICE_MS) {
      await yieldToEventLoop();
      if (runToken !== ieeeRunToken) return false;
      sliceStart = performance.now();
    }
  }

  return true;
}

/* Rebuilds the page stack and swaps it in once it is ready. The new pages are
   measured in the document but out of sight, so what is on screen stays put -
   otherwise every edit flashes the unpaginated layout and bounces the reader
   back to page one. */
async function repaginateIeeePreview(markdown) {
  if (!md) return;
  if (!markdownPreview.classList.contains("markdown-preview--ieee")) return;

  const runToken = ++ieeeRunToken;

  // Only cloned from, so it can stay detached.
  const host = document.createElement("div");
  host.innerHTML = getIeeeLayoutHtml(markdown);
  const layout = host.querySelector(".ieee-paper-layout");
  if (!layout) return;

  const stack = document.createElement("div");
  stack.className = "ieee-page-stack";

  // Pages already showing: measure the new ones out of sight. Empty preview:
  // build them in place so something appears right away.
  let staging = null;
  if (markdownPreview.querySelector(".ieee-page-stack")) {
    staging = document.createElement("div");
    staging.style.cssText = IEEE_STAGING_STYLE;
    staging.appendChild(stack);
    markdownPreview.appendChild(staging);
  } else {
    markdownPreview.appendChild(stack);
  }

  const startedAt = performance.now();
  let completed = false;
  try {
    completed = await paginateIeeePreview(runToken, layout, stack);
  } finally {
    lastPaginateDurationMs = performance.now() - startedAt;
    if (!completed || runToken !== ieeeRunToken) (staging || stack).remove();
  }
  if (!completed || runToken !== ieeeRunToken) return;

  // Swapping children resets scroll. Restore before paint, and again after the
  // fit scale changes the page heights.
  const scrollTop = markdownPreview.scrollTop;
  markdownPreview.replaceChildren(stack);
  markdownPreview.scrollTop = scrollTop;
  previewNeedsFullRender = true;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (runToken !== ieeeRunToken) return;
    applyIeeePreviewViewportFit();
    markdownPreview.scrollTop = scrollTop;
  }));
}

function scheduleIeeeRepagination(markdown) {
  // Bump the token first so any run already in flight stops immediately.
  ieeeRunToken += 1;
  if (ieeeRepaginateTimer) clearTimeout(ieeeRepaginateTimer);
  // Nothing on screen yet, or short enough to repaginate between keystrokes:
  // go now. Slow papers wait for a pause in typing.
  const delay = !markdownPreview.querySelector(".ieee-page-stack") ||
    lastPaginateDurationMs <= IEEE_REPAGINATE_FAST_LIMIT_MS
    ? 0
    : IEEE_REPAGINATE_IDLE_MS;
  ieeeRepaginateTimer = setTimeout(() => {
    ieeeRepaginateTimer = null;
    if ((markdownInput.value || "") !== markdown) return;
    repaginateIeeePreview(markdown);
  }, delay);

  // Web fonts shift line metrics, so repaginate once they land - once, not on
  // every render.
  if (!ieeeFontsWatched && document.fonts?.ready) {
    ieeeFontsWatched = true;
    document.fonts.ready.then(() => {
      if (!markdownPreview.classList.contains("markdown-preview--ieee")) return;
      repaginateIeeePreview(markdownInput.value || "");
    }).catch(() => {});
  }
}

export function renderDocument(markdown, options = {}) {
  const rendered = renderMarkdown(markdown);
  if (!options.ieeeLayout) return rendered;

  return buildIeeeLayoutHtml(rendered, markdown);
}

export function renderPreview() {
  if (!md) {
    markdownPreview.textContent = markdownInput.value || "";
    return;
  }

  const startedAt = performance.now();
  const markdown = markdownInput.value || "";
  if (typeof window.syncIeeeModeFromMarker === "function") {
    window.syncIeeeModeFromMarker(markdown);
  }
  const hasSlides = SLIDE_MARKER_RE.test(markdown);
  const useIeeeLayout = Boolean(window.latexModeEnabled && window.ieeeModeEnabled);

  if (hasSlides && window.autoRenderSlides) {
    // Drop any pagination in flight, or it writes into a preview that slide
    // mode has taken over.
    ieeeRunToken += 1;
    resetIncrementalPreview();
    markdownPreview.classList.remove("markdown-preview--ieee");
    window.autoRenderSlides();
  } else {
    if (window.isSlideMode) {
      window.exitSlideMode();
    }
    markdownPreview.classList.toggle("markdown-preview--ieee", useIeeeLayout);
    if (useIeeeLayout) {
      resetIncrementalPreview();
      // Coming from normal or slide rendering: clear it, pages take over.
      // Existing pages stay until the new ones are ready.
      if (!markdownPreview.querySelector(".ieee-page-stack")) {
        markdownPreview.replaceChildren();
      }
      scheduleIeeeRepagination(markdown);
    } else {
      ieeeRunToken += 1;
      renderPreviewIncremental(markdown);
    }
  }

  lastRenderDurationMs = performance.now() - startedAt;
}

export function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  // Back off on documents that render slowly rather than burning every idle
  // gap on a re-render.
  const delay = lastRenderDurationMs > RENDER_SLOW_THRESHOLD_MS
    ? RENDER_DEBOUNCE_SLOW_MS
    : RENDER_DEBOUNCE_MS;
  renderTimer = setTimeout(renderPreview, delay);
}

export function showSpinner(show) {
  backdrop.style.display = show ? "block" : "none";
  loadingSpinner.style.display = show ? "block" : "none";
}
