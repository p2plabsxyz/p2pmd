// An export with no Document title was named after the note's key, which lets
// whoever reads the file name into the note.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { p2pmdNoteTitle } from "../note-title.js";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const start = app.indexOf("function getExportFileName(extension) {");
const getExportFileName = app.slice(start, app.indexOf("\n}\n", start));

describe("an exported file's name", () => {
  it("is the Document title, else the note's own title", () => {
    assert.match(getExportFileName, /const base = title \|\| p2pmdNoteTitle\(markdownInput\?\.value \|\| ""\)/);
    assert.equal(p2pmdNoteTitle("# Trip to Pune!\n\nDay one"), "Trip to Pune!");
  });

  it("never carries the note's key", () => {
    assert.doesNotMatch(getExportFileName, /currentRoomKey/);
    assert.match(getExportFileName, /\|\| "p2pmd-document";/);
  });
});

describe("Full preview", () => {
  // PeerSky opened the slides in a new tab and still said pop-ups were blocked.
  it("says pop-ups are blocked only outside PeerSky", () => {
    assert.match(app, /if \(!slidesWindow && !window\.peersky\) \{\s+alert\("Please allow pop-ups/);
  });
});
