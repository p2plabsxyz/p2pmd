// With the host gone, a guest could type into the note. It reached nobody,
// and once the host came back the guest's text was gone. A join with nobody
// hosting left the page waiting, then opened an empty note. Now a guest writes
// only while the host is there, and a join says when nobody has the note open.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const between = (start, end) => {
  const from = app.indexOf(start);
  assert.notEqual(from, -1, start);
  const to = app.indexOf(end, from + start.length);
  assert.notEqual(to, -1, end);
  return app.slice(from, to);
};

describe("a guest whose host is away", () => {
  it("writes only while the host is there and its copy has loaded", () => {
    assert.match(app, /function canEdit\(\) \{\s*return !currentRoomUrl \|\| currentRole === "host" \|\| \(hostReachable && seededFromHost\);/);
    assert.match(app, /markdownInput\.readOnly = !editable;/);
    // Typing, the toolbar, templates, AI and fetched text all go through here.
    assert.match(between("export function scheduleSend()", "// Current CRDT text"), /if \(!canEdit\(\)\) \{[\s\S]*?markdownInput\.value = kept;/);
    assert.match(app, /clearDraftButton\.addEventListener\("click", async \(\) => \{\s*if \(!canEdit\(\)\) return;/);
    assert.match(css, /#editor-page\.host-away #formatting-toolbar,[\s\S]*?pointer-events: none;/);
  });

  it("goes read only when the room's stream drops and says so after a moment", () => {
    const events = between("function connectSseChannel(", "async function connectToRoom(");
    assert.match(events, /eventSource\.onerror = \(\) => \{[\s\S]*?if \(currentRole !== "host"\) \{\s*hostReachable = false;\s*updateEditable\(\);\s*setHostAway\(true\);/);
    assert.match(events, /eventSource\.onopen = \(\) => \{\s*hostReachable = true;\s*if \(currentRole === "host" \|\| seededFromHost\) void syncYjsWithHost\(\);\s*else void seedFromHost\(\);/);
    assert.match(app, /const HOST_AWAY_NOTICE_MS = 3000;/);
    assert.match(html, /id="host-away-notice"[^>]*>\s*The host is away\. You can read the note, and editing comes back when they return\.\s*</);
  });

  it("still says so when every retry fails sooner than the wait", async () => {
    // The stream is tried again every two seconds and each failure says the
    // host is away again. Starting the wait over each time meant the notice
    // never showed and the note just stopped taking input.
    const source = between("function setHostAway(away) {", "\nfunction ");
    const hidden = new Set(["hidden"]);
    const notice = { classList: { add: (name) => hidden.add(name), remove: (name) => hidden.delete(name), contains: (name) => hidden.has(name) } };
    const setHostAway = new Function("hostAwayNotice", "canEdit", `
      let hostAwayTimer = null;
      const HOST_AWAY_NOTICE_MS = 30;
      ${source}
      return setHostAway;
    `)(notice, () => false);
    for (let i = 0; i < 8; i++) {
      setHostAway(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(hidden.has("hidden"), false);
    setHostAway(false);
    assert.equal(hidden.has("hidden"), true);
  });

  it("takes the host's copy whole when it has none, never one of its own", () => {
    const connect = between("async function connectToRoom(", "// openedFile:");
    assert.match(connect, /hostReachable = false;\s*seededFromHost = false;\s*updateEditable\(\);/);
    assert.match(connect, /seededFromHost = currentRole === "host" \|\| hostStateLoaded;/);
    assert.match(connect, /if \(yjsRes\.ok\) \{[\s\S]*?hostStateLoaded = true;\s*\} else if \(yjsRes\.status === 404 && serverHadDoc\) \{[\s\S]*?hostStateLoaded = true;/);
    const sync = between("async function syncYjsWithHost()", "async function recoverYjsStateFromServer()");
    assert.match(sync, /if \(!shared\) \{\s*if \(currentRole !== "host"\) \{\s*seededFromHost = false;\s*updateEditable\(\);\s*void seedFromHost\(\);/);
  });
});

describe("joining a note nobody has open", () => {
  it("asks the host for 15 seconds, then says so on the page", () => {
    assert.match(app, /const HOST_LOOK_MS = 15000;/);
    const join = between("async function joinRoom(", "async function disconnectRoom(");
    assert.match(join, /if \(!data\.hosted\) \{\s*setLoadingMessage\("Looking for the host…"\);\s*if \(!\(await roomAnswers\(data\.localUrl, HOST_LOOK_MS\)\)\) \{\s*await closeRoomSession\(key\);\s*throw new Error\(NO_HOST_MESSAGE\);/);
    assert.match(app, /const NO_HOST_MESSAGE = "Nobody has this note open right now\. Try again when its host opens it\.";/);
    // Back on the start screen with the key in the box, and no pop-up.
    assert.match(join, /joinRoomKey\.value = key;\s*syncJoinButton\(\);\s*setView\("setup"\);/);
    assert.match(join, /showSetupError\(error\.message \|\| "Failed to join room"\);/);
    assert.doesNotMatch(join, /alert\(/);
  });
});
