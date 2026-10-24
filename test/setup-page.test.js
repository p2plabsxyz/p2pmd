// The start screen as on the phone: create, then join, then the notes opened
// before. Create asks private or public, as the phone's sheet does; the
// desktop had a Private box only. The network options stay, for creating and
// joining both.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const setup = html.slice(html.indexOf('<section id="setup-page"'), html.indexOf('<section id="editor-page"'));
const dialog = setup.slice(setup.indexOf('<dialog id="new-note-dialog"'), setup.indexOf("</dialog>"));

describe("the start screen", () => {
  it("lays out create, join and recent notes in the phone's words", () => {
    const order = [
      "A real-time peer-to-peer Markdown editor for writing notes and collaboration.",
      "Start a collaborative note",
      'id="create-room"',
      'id="setup-name"',
      "<span>or join</span>",
      "Join existing note",
      'placeholder="hs://... note key"',
      'id="paste-room-key"',
      'id="join-room"',
      "Recent notes",
      "Stored note data",
      "Network options",
    ].map((text) => setup.indexOf(text));
    assert.ok(order.every((at) => at > -1), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it("asks private or public for a new note, private first every time", () => {
    assert.match(dialog, /<input id="privateMode" type="radio" name="note-privacy" value="private" checked \/>/);
    assert.match(dialog, /<input id="publicMode" type="radio" name="note-privacy" value="public" \/>/);
    assert.match(dialog, /Only people you send the key to can open it\. Your other devices can host it too\./);
    assert.match(dialog, /Anyone with the key can open it, and the computers that help peers find each other see the key\. Only this computer can host it\./);
    const open = app.slice(app.indexOf('createRoomButton.addEventListener("click"'), app.indexOf('newNoteCancel?.addEventListener'));
    assert.match(open, /setPrivacyChoice\(true\);\s*newNoteDialog\.showModal\(\);/);
    assert.match(open, /newNoteForm\?\.addEventListener\("submit", \(event\) => \{\s*event\.preventDefault\(\);\s*newNoteDialog\.close\(\);\s*createRoom\(\);/);
    // A radio set from a joined note still leaves one of the two picked.
    assert.match(app, /function setPrivacyChoice\(isPrivate\) \{\s*privateMode\.checked = isPrivate;\s*if \(publicMode\) publicMode\.checked = !isPrivate;/);
    assert.doesNotMatch(app, /privateMode\.checked = (?!isPrivate)/);
  });

  it("keeps UDP, the local host and the port, for notes made or joined here", () => {
    const options = setup.slice(setup.indexOf('<details class="network-options">'), setup.indexOf("</details>"));
    for (const id of ["udpMode", "localHost", "localPort"]) assert.match(options, new RegExp(`id="${id}"`));
    assert.doesNotMatch(dialog, /udpMode|localHost|localPort/);
    assert.doesNotMatch(setup, /8989/);
  });

  it("says what went wrong on the page instead of in a pop-up", () => {
    assert.match(setup, /<p id="setup-error" class="setup-error hidden" role="alert"><\/p>/);
    const create = app.slice(app.indexOf("async function createRoom("), app.indexOf("async function joinRoomWithOptions("));
    assert.match(create, /showSetupError\(error\.message \|\| "Failed to create room"\);/);
    assert.doesNotMatch(create, /alert\(/);
  });

  it("enables Join once there is a key, and pastes one", () => {
    assert.match(setup, /<button id="join-room" class="join-action" type="submit" disabled>Join Note<\/button>/);
    assert.match(app, /function syncJoinButton\(\) \{\s*if \(joinRoomButton\) joinRoomButton\.disabled = !joinRoomKey\.value\.trim\(\);/);
    assert.match(app, /const text = \(await navigator\.clipboard\.readText\(\)\)\.trim\(\);/);
  });
});

// A file opened with P2PMD from the file manager (the browser's
// open-in-p2pmd.js) arrives as ?open=<id>. The browser starts the note with
// the file's text, so the text never passes through the page.
describe("a file opened with P2PMD", () => {
  it("becomes a new private note, made from the id once", () => {
    assert.match(app, /function takeOpenParam\(\) \{[\s\S]*?params\.delete\("open"\);[\s\S]*?history\.replaceState\(/);
    assert.match(app, /return \/\^\[0-9a-f\]\{32\}\$\/\.test\(id\) \? id : "";/);
    assert.match(app, /async function openPendingFile\(\) \{[\s\S]*?setPrivacyChoice\(true\);\s*await createRoom\(\{ openedFile: id \}\);/);
    assert.match(app, /\.\.\.\(openedFile && \{ openedFile \}\)/);
    // The first time, a name first; the file waits for it.
    const start = app.slice(app.indexOf("pendingOpenedFile = takeOpenParam();"), app.indexOf("const joinKey = takeJoinParam();"));
    assert.match(start, /if \(!hasDisplayName\(\)\) \{\s*setView\("onboarding"\);/);
    assert.match(app, /await loadRecentRooms\(\);\s*await openPendingFile\(\);\s*\}\);/);
  });
});
