// The copies of notes a desktop keeps for itself. What has to hold: nothing on
// the drive gives away a note's key or text without that key, either spelling
// of a key finds the same copy, and every copy kept the old way, in rooms/ on
// the drive "Publish to hyper://" uses, can be found and moved.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  NOTE_COPY_FOLDER,
  legacyNoteCopyOf,
  legacyNoteCopyPaths,
  noteCopyPath,
  openNoteCopy,
  sealNoteCopy,
} from "../note-copies.js";

const PRIVATE_KEY = `hs://s000${"c0ffee".repeat(10)}abcd`;
const PUBLIC_KEY = `hs://0000${"bb1y9xkh3fixxfytm44woxspxdqzjgn7bwoad38h5fyh7ha4cfmy".slice(0, 52)}`;

describe("note copies", () => {
  it("open with the note's key and give nothing away without it", async () => {
    const text = "# Plans\n\nThe launch date is the 14th.";
    const sealed = await sealNoteCopy(PRIVATE_KEY, text);
    assert.equal(Buffer.from(sealed.subarray(0, 4)).toString(), "PMD1");
    assert.ok(!Buffer.from(sealed).includes(Buffer.from("launch")));
    assert.equal(await openNoteCopy(PRIVATE_KEY, sealed), text);
    await assert.rejects(() => openNoteCopy(PUBLIC_KEY, sealed), /could not be opened/);
  });

  it("open with either spelling of the key", async () => {
    const sealed = await sealNoteCopy(PRIVATE_KEY, "same note");
    assert.equal(await openNoteCopy(PRIVATE_KEY.slice("hs://".length), sealed), "same note");
  });

  it("do not open when changed, or when not sealed at all", async () => {
    const sealed = await sealNoteCopy(PRIVATE_KEY, "text");
    sealed[sealed.length - 1] ^= 0x01;
    await assert.rejects(() => openNoteCopy(PRIVATE_KEY, sealed), /could not be opened/);
    await assert.rejects(() => openNoteCopy(PRIVATE_KEY, new TextEncoder().encode("# plain markdown")), /Not a sealed note copy/);
  });

  it("are sealed afresh every time", async () => {
    assert.notDeepEqual(await sealNoteCopy(PRIVATE_KEY, "text"), await sealNoteCopy(PRIVATE_KEY, "text"));
  });

  it("round-trip an empty note and any text", async () => {
    for (const text of ["", "héllo wörld ✓", "x".repeat(200000)]) {
      assert.equal(await openNoteCopy(PRIVATE_KEY, await sealNoteCopy(PRIVATE_KEY, text)), text);
    }
  });
});

describe("where a copy is kept", () => {
  it("is named by a hash, not by the key", async () => {
    const path = await noteCopyPath(PRIVATE_KEY, "copy");
    assert.match(path, /^notes\/[a-f0-9]{32}\.copy$/);
    assert.ok(path.startsWith(NOTE_COPY_FOLDER));
    assert.ok(!path.includes(PRIVATE_KEY.slice(5, 15)));
  });

  // Copies already on people's drives are found by this name. Changing how it
  // is made would lose them.
  it("stays where it was", async () => {
    assert.equal(await noteCopyPath(PRIVATE_KEY, "copy"), "notes/8af8fb78dca3b269562b72d89963b9ce.copy");
  });

  it("is the same for either spelling, and different for each kind and note", async () => {
    assert.equal(await noteCopyPath(PRIVATE_KEY, "draft"), await noteCopyPath(PRIVATE_KEY.slice(5), "draft"));
    const paths = new Set([
      await noteCopyPath(PRIVATE_KEY, "copy"),
      await noteCopyPath(PRIVATE_KEY, "lines"),
      await noteCopyPath(PRIVATE_KEY, "draft"),
      await noteCopyPath(PUBLIC_KEY, "copy"),
    ]);
    assert.equal(paths.size, 4);
  });

  it("refuses what is not a note key or a kind of copy", async () => {
    await assert.rejects(() => noteCopyPath("not a key", "copy"), /Invalid note key/);
    await assert.rejects(() => noteCopyPath(PRIVATE_KEY, "rooms"), /Unknown kind/);
  });
});

describe("copies kept the old way", () => {
  it("are looked for under both spellings the editor used", () => {
    const bare = PRIVATE_KEY.slice(5);
    assert.deepEqual(legacyNoteCopyPaths(PRIVATE_KEY, "copy"), [`rooms/hs_${bare}.md`, `rooms/${bare}.md`]);
    assert.deepEqual(legacyNoteCopyPaths(bare, "lines"), [
      `rooms/hs_${bare}.line-attributions.json`,
      `rooms/${bare}.line-attributions.json`,
    ]);
    assert.deepEqual(legacyNoteCopyPaths(PRIVATE_KEY, "draft"), [`hs_${bare}.json`, `${bare}.json`]);
  });

  it("are told apart by name, in rooms/ and in the drafts drive", () => {
    const bare = PRIVATE_KEY.slice(5);
    assert.deepEqual(legacyNoteCopyOf(`hs_${bare}.md`, "rooms"), { key: PRIVATE_KEY, kind: "copy" });
    assert.deepEqual(legacyNoteCopyOf(`${bare}.line-attributions.json`, "rooms"), { key: PRIVATE_KEY, kind: "lines" });
    assert.deepEqual(legacyNoteCopyOf(`hs_${bare}.json`, "drafts"), { key: PRIVATE_KEY, kind: "draft" });
    assert.equal(legacyNoteCopyOf(`hs_${bare}.json`, "rooms"), null);
    assert.equal(legacyNoteCopyOf(`hs_${bare}.md`, "drafts"), null);
    for (const name of ["notes/", "index.html", "my-post.html", "hs_short.md", "", null]) {
      assert.equal(legacyNoteCopyOf(name, "rooms"), null, String(name));
      assert.equal(legacyNoteCopyOf(name, "drafts"), null, String(name));
    }
  });
});
