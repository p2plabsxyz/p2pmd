// Which lines a change wrote on and where the others went. Mirrors
// peersky-mobile's test/protocol/p2pmd-line-authors.test.mjs: the phone runs
// the same rules, and the two have to agree.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { lineChangesFromDelta, trimLineAuthors } from "../line-authors.js";

const Y = new Function(`${readFileSync(new URL("../lib/yjs.min.js", import.meta.url), "utf8")}; return Y`)();

// The delta Yjs reports for a change, as an editor receives it.
function change(oldText, edit) {
  const doc = new Y.Doc();
  const text = doc.getText("t");
  text.insert(0, oldText);
  let delta = null;
  text.observe((event) => { delta = event.changes.delta; });
  doc.transact(() => edit(text));
  return { ...lineChangesFromDelta(oldText, delta), newText: text.toString() };
}

const lines = (map) => Object.fromEntries([...map]);

describe("line authors", () => {
  it("writes on the line typed in and moves nothing", () => {
    const result = change("one\ntwo\nthree", (t) => t.insert(6, "X"));
    assert.deepEqual([...result.written], [2]);
    assert.deepEqual(lines(result.moved), { 1: 1, 2: 2, 3: 3 });
  });

  it("writes on the new line a line break starts, not the one above", () => {
    const result = change("one\ntwo\nthree", (t) => t.insert(7, "\n"));
    assert.deepEqual([...result.written], [3]);
    assert.deepEqual(lines(result.moved), { 1: 1, 2: 2, 3: 4 });
  });

  it("moves every line below lines pasted above", () => {
    const result = change("one\ntwo", (t) => t.insert(0, "a\nb\n"));
    assert.deepEqual([...result.written].sort(), [1, 2]);
    assert.deepEqual(lines(result.moved), { 1: 3, 2: 4 });
  });

  it("loses a deleted line and joins two lines without writing on either", () => {
    assert.deepEqual(lines(change("one\ntwo\nthree\nfour", (t) => t.delete(4, 4)).moved), { 1: 1, 3: 2, 4: 3 });
    const joined = change("one\ntwo\nthree", (t) => t.delete(7, 1));
    assert.deepEqual([...joined.written], []);
    assert.deepEqual(lines(joined.moved), { 1: 1, 2: 2 });
  });

  it("leaves one written line when the whole note is replaced", () => {
    const old = Array.from({ length: 39 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = change(old, (t) => { t.delete(0, old.length); t.insert(0, "Fresh start"); });
    assert.deepEqual([...result.written], [1]);
    assert.deepEqual(lines(result.moved), {});
  });

  it("drops authors past the end of the note", () => {
    const authors = { 1: { name: "A" }, 4: { name: "B" }, 39: { name: "B" } };
    assert.deepEqual(trimLineAuthors(authors, 3), { changed: true, map: { 1: { name: "A" } } });
    assert.equal(trimLineAuthors(authors, 39).changed, false);
  });
});
