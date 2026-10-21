// A note on another of this person's devices is looked for first, and when
// nobody answers, the desktop hosts its own copy. The page still opened it as
// a guest: "client", with itself counted as one person in the note.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const join = app.slice(app.indexOf("async function joinRoom("), app.indexOf("async function disconnectRoom("));

describe("joining a note this device ends up hosting", () => {
  it("opens it as its host whenever the desktop says it hosts it", () => {
    assert.doesNotMatch(join, /resolvedState, "client"\)/);
    assert.equal(join.match(/enterJoinedRoom\(key, data, \w+, resolvedState, data\.hosted \? "host" : "client"\)/g)?.length, 2);
  });
});
