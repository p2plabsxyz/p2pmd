// An hs:// link clicked on the desktop said "Unknown hs target". The browser
// now opens P2PMD with ?join=<key>, and the key goes in the join box with
// Join left to press, as on the phone.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
const take = app.slice(app.indexOf("function takeJoinParam()"), app.indexOf("(async () => {\n  showSetupBootScreen();"));
const start = app.slice(app.indexOf("(async () => {\n  showSetupBootScreen();"));

describe("opening P2PMD from a note link", () => {
  it("takes the key from ?join= and only a real note key", () => {
    assert.match(take, /const key = canonicalNoteKey\(params\.get\("join"\) \|\| ""\);/);
    // Off the address, so a reload does not fill the box again.
    assert.match(take, /params\.delete\("join"\);[\s\S]*history\.replaceState\(/);
  });

  it("fills the join box and leaves Join to press", () => {
    const block = start.slice(start.indexOf("const joinKey = takeJoinParam();"), start.indexOf("const viewParam = getViewParam();"));
    assert.match(block, /joinRoomKey\.value = joinKey;/);
    assert.match(block, /setView\("setup"\);\s+document\.getElementById\("join-room"\)\?\.focus\(\);\s+return;/);
    assert.doesNotMatch(block, /joinRoom\(/);
    // Someone without a name yet sets one first; the key waits in the box.
    assert.match(block, /if \(!hasDisplayName\(\)\) \{\s+setView\("onboarding"\);/);
  });
});
