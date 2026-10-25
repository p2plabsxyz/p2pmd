// Export PDF printed a note's tables as loose words, with nothing between the
// rows and columns, and a research paper's list of cited links under a heading
// larger than every other.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const start = app.indexOf("const publishCSS = `");
const publishCSS = app.slice(start, app.indexOf("`;", start));

describe("Export PDF", () => {
  it("prints a note's tables with their lines and a header row", () => {
    assert.match(publishCSS, /th,\s+td \{\s+border: 1px solid #c9ccd1;/);
    assert.match(publishCSS, /th \{\s+background: #f2f3f5;/);
    // A long table repeats its header on every page.
    assert.match(publishCSS, /thead \{\s+display: table-header-group;/);
  });

  it("gives a paper's list of cited links a heading like its others", () => {
    assert.match(app, /body\.ieee-paper \.ieee-columns > div > h2:first-child \{\s+font-size: 1\.17em;/);
    assert.match(styles, /#markdownPreview\.markdown-preview--ieee \.ieee-columns > div > h2:first-child \{\s+font-size: 1\.17em;/);
  });
});
