// Where one edit of the textarea goes. Two people typing at once is where it
// matters: the CRDT keeps the place it is given, and a line placed after the
// note's last line break lands in among what someone else types at the end.
//
// Mirrors the diffTextChange cases in peersky-mobile's
// test/protocol/p2pmd-editor-page.test.mjs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { diffTextChange } from "../text-diff.js";

describe("text diff", () => {
  it("puts a line break typed before another one where the caret is", () => {
    assert.deepEqual(diffTextChange("a\n", "a\nb\n", 3), { prefixLen: 1, oldSuffix: 1, newSuffix: 3 });
    // Without the caret it is placed after the last line break, as before.
    assert.deepEqual(diffTextChange("a\n", "a\nb\n"), { prefixLen: 2, oldSuffix: 2, newSuffix: 4 });
  });

  it("deletes the line break the caret was at", () => {
    assert.deepEqual(diffTextChange("a\n\nb", "a\nb", 1), { prefixLen: 1, oldSuffix: 2, newSuffix: 1 });
  });

  it("trims the ends when the caret does not fit the change", () => {
    // A word replaced, as autocorrect does.
    assert.deepEqual(diffTextChange("teh cat", "the cat", 3), { prefixLen: 1, oldSuffix: 3, newSuffix: 3 });
    // A caret somewhere else, as after text set from code.
    assert.deepEqual(diffTextChange("a\n", "a\nb\n", 0), { prefixLen: 2, oldSuffix: 2, newSuffix: 4 });
    assert.deepEqual(diffTextChange("abc", "xabc", null), { prefixLen: 0, oldSuffix: 0, newSuffix: 1 });
  });

  it("gives the same text whichever place it picks", () => {
    const cases = [["a\n", "a\nb\n", 3], ["a\n\nb", "a\nb", 1], ["one two", "one too two", 7], ["x\n\n\ny", "x\n\ny", 2]];
    for (const [before, after, caret] of cases) {
      const { prefixLen, oldSuffix, newSuffix } = diffTextChange(before, after, caret);
      assert.equal(before.slice(0, prefixLen) + after.slice(prefixLen, newSuffix) + before.slice(oldSuffix), after);
    }
  });
});
