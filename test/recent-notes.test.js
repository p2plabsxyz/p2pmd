// The start screen listed the last five notes, built once when the page
// loaded, so a note just left only showed up after a reload. It lists every
// note now, with a search box once there are many, as the phone does.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  collectRecentNotes,
  filterRecentNotes,
  isPrivateNoteKey,
  RECENT_SEARCH_AFTER,
  shortNoteKey,
} from "../recent-notes.js";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const privateKey = `hs://s000${"a".repeat(64)}`;
const publicKey = `hs://0000${"b".repeat(64)}`;

describe("recent notes", () => {
  it("lists each note once, newest first, all of them", () => {
    const states = [];
    for (let i = 0; i < 12; i++) states.push({ key: `hs://s000${String(i).padStart(64, "0")}`, savedAt: i });
    // The same note under another spelling of its key, saved later.
    states.push({ key: states[0].key, savedAt: 100, hosted: true });
    const notes = collectRecentNotes(states);
    assert.equal(notes.length, 12);
    assert.deepEqual(notes[0], { key: states[0].key, savedAt: 100, hosted: true });
    assert.deepEqual(notes.slice(1).map((note) => note.savedAt), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    assert.doesNotMatch(app, /rooms\.slice\(0, 5\)/);
  });

  it("leaves out notes taken off the list until they are opened again", () => {
    const hidden = { key: privateKey, savedAt: 5, hiddenFromRecents: true };
    assert.deepEqual(collectRecentNotes([hidden, { key: publicKey, savedAt: 1 }]).map((note) => note.key), [publicKey]);
    // Opening it saves a fresh state, without the mark.
    assert.equal(collectRecentNotes([hidden, { key: privateKey, savedAt: 9 }]).length, 1);
    assert.equal(collectRecentNotes([null, {}, { key: "" }, "nonsense"]).length, 0);
    const forget = app.slice(app.indexOf("function forgetRecentRoom("), app.indexOf("// A file opened with P2PMD"));
    assert.match(forget, /hiddenFromRecents: true/);
    assert.match(forget, /goes off this list\. The note itself stays in the room and in Settings > P2P Data\./);
  });

  it("searches names and keys, and shows the box past ten notes", () => {
    const notes = [
      { key: privateKey, label: "Note - Test Book Club" },
      { key: publicKey, label: "Note - Test Garden" },
    ];
    assert.deepEqual(filterRecentNotes(notes, "BOOK").map((note) => note.key), [privateKey]);
    assert.deepEqual(filterRecentNotes(notes, "bbbb").map((note) => note.key), [publicKey]);
    assert.equal(filterRecentNotes(notes, "  ").length, 2);
    assert.equal(filterRecentNotes(notes, "zzz").length, 0);
    assert.equal(RECENT_SEARCH_AFTER, 10);
    assert.match(app, /roomHistorySearch\?\.classList\.toggle\("hidden", recentRooms\.length <= RECENT_SEARCH_AFTER\)/);
    assert.match(html, /id="room-history-empty"[^>]*>No notes by that name\.</);
  });

  it("marks private and public notes and says what opening one does", () => {
    assert.equal(isPrivateNoteKey(privateKey), true);
    assert.equal(isPrivateNoteKey(publicKey), false);
    assert.equal(shortNoteKey(privateKey), `s000${"a".repeat(16)}...`);
    const render = app.slice(app.indexOf("function renderRecentRooms()"), app.indexOf("function forgetRecentRoom("));
    assert.match(render, /icon\.innerHTML = isPrivate \? SETUP_ICONS\.shield : SETUP_ICONS\.globe;/);
    assert.match(render, /const action = note\.hosted \? "Reopen" : "Join";/);
    // A note's name is written as text, never as markup.
    assert.match(render, /label\.textContent = name;/);
    assert.doesNotMatch(render, /innerHTML = (?!isPrivate)/);
  });

  it("is up to date the moment a note is left", () => {
    const leave = app.slice(app.indexOf("async function disconnectRoom()"), app.indexOf("function toggleTitleInput()"));
    assert.match(leave, /setView\("setup"\);\s*await loadRecentRooms\(\);\s*\}\s*$/);
  });
});
