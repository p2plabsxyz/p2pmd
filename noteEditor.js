import { markdownInput, markdownPreview, slidesPreview, viewSlidesButton, fullPreviewButton, loadingSpinner, backdrop } from "./common.js";

let md = null;
let renderTimer = null;

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

    renderPreview();
  } catch {
    md = null;
    markdownPreview.textContent = markdownInput.value || "";
  }
}

export function renderMarkdown(markdown) {
  if (!md) return markdown || "";
  const cleanedMarkdown = (markdown || "").replace(/<!--[\s\S]*?-->/g, "");
  return md.render(cleanedMarkdown);
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

function buildIeeeLayoutHtml(renderedHtml) {
  const host = document.createElement("div");
  host.innerHTML = renderedHtml || "";

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
  const probeRect = tailProbe.getBoundingClientRect();
  tailProbe.remove();

  const overflowByProbe = probeRect.bottom > colsRect.bottom + 0.5 || probeRect.right > colsRect.right + 0.5;

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

  return overflowByProbe || overflowByInnerHeight || overflowByColumnHeight || overflowByColumns || overflowByGeometry;
}

function paginateIeeePreview() {
  const layout = markdownPreview.querySelector(".ieee-paper-layout");
  if (!layout) return 0;

  const frontmatter = layout.querySelector(":scope > .ieee-frontmatter");
  const columns = layout.querySelector(":scope > .ieee-columns");
  if (!columns) return 0;

  const blocks = Array.from(columns.childNodes).filter(shouldKeepPreviewNode);

  const stack = document.createElement("div");
  stack.className = "ieee-page-stack";

  const first = createIeeePreviewPage(frontmatter ? frontmatter.cloneNode(true) : null);
  stack.appendChild(first.page);

  // Attach stack before measuring overflow so clientHeight/geometry are valid.
  layout.replaceWith(stack);

  let currentInner = first.inner;
  let currentColumns = first.columns;
  blocks.forEach((block) => {
    let nodeToPlace = block.cloneNode(true);

    while (nodeToPlace) {
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

      const nextPage = createIeeePreviewPage();
      stack.appendChild(nextPage.page);
      currentInner = nextPage.inner;
      currentColumns = nextPage.columns;
    }
  });

  return stack.childElementCount;
}

function repaginateIeeePreview(markdown) {
  markdownPreview.innerHTML = renderDocument(markdown, { ieeeLayout: true });
  return paginateIeeePreview();
}

export function renderDocument(markdown, options = {}) {
  const rendered = renderMarkdown(markdown);
  if (!options.ieeeLayout) return rendered;

  return buildIeeeLayoutHtml(rendered);
}

export function renderPreview() {
  if (!md) {
    markdownPreview.textContent = markdownInput.value || "";
    return;
  }

  const markdown = markdownInput.value || "";
  if (typeof window.syncIeeeModeFromMarker === "function") {
    window.syncIeeeModeFromMarker(markdown);
  }
  const hasSlides = /^---$|^<!-- slide -->$/gm.test(markdown);
  const useIeeeLayout = Boolean(window.latexModeEnabled && window.ieeeModeEnabled);

  if (hasSlides && window.autoRenderSlides) {
    markdownPreview.classList.remove("markdown-preview--ieee");
    window.autoRenderSlides();
  } else {
    if (window.isSlideMode) {
      window.exitSlideMode();
    }
    markdownPreview.classList.toggle("markdown-preview--ieee", useIeeeLayout);
    markdownPreview.innerHTML = renderDocument(markdown, { ieeeLayout: useIeeeLayout });
    if (useIeeeLayout) {
      requestAnimationFrame(() => {
        if ((markdownInput.value || "") !== markdown) return;
        repaginateIeeePreview(markdown);

        if (document.fonts?.ready) {
          document.fonts.ready.then(() => {
            if ((markdownInput.value || "") !== markdown) return;
            repaginateIeeePreview(markdown);
          });
        }
      });
    }
  }
}

export function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 120);
}

export function showSpinner(show) {
  backdrop.style.display = show ? "block" : "none";
  loadingSpinner.style.display = show ? "block" : "none";
}
