// A host that comes back from an older save, and peers that kept editing:
// they have to end up on one note again.
//
// Mirrors the compareWithHost cases in peersky-mobile's
// test/protocol/p2pmd-editor-page.test.mjs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { compareWithHost } from "../yjs-sync.js";

// The same Yjs build the page loads.
// eslint-disable-next-line no-new-func
const Y = new Function(`${readFileSync(new URL("../lib/yjs.min.js", import.meta.url), "utf8")}; return Y`)();

const text = (doc) => doc.getText("content").toString();
const copy = (from, clientID) => {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(from));
  return doc;
};

describe("catching up with the host", () => {
  it("brings a host restarted from an older save back to the peers' note", () => {
    const host = new Y.Doc();
    host.clientID = 1;
    host.getText("content").insert(0, "L1\n");
    const saved = Y.encodeStateAsUpdate(host);
    // The host types more, a peer gets it, and the host crashes before saving.
    host.getText("content").insert(3, "L2 typed before the crash\n");
    const peer = copy(host, 2);
    peer.getText("content").insert(text(peer).length, "L3 from the peer while the host was away\n");

    const restarted = new Y.Doc();
    restarted.clientID = 3;
    Y.applyUpdate(restarted, saved);
    // An update that builds on what the host lost goes nowhere.
    Y.applyUpdate(restarted, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(host)));
    assert.equal(text(restarted), "L1\n");

    const { shared, missing } = compareWithHost(Y, peer, Y.encodeStateAsUpdate(restarted));
    assert.equal(shared, true);
    Y.applyUpdate(restarted, missing);
    assert.equal(text(restarted), "L1\nL2 typed before the crash\nL3 from the peer while the host was away\n");
  });

  it("sends nothing when the host already has it all", () => {
    const host = new Y.Doc();
    host.getText("content").insert(0, "same");
    const peer = copy(host, 9);
    assert.deepEqual(compareWithHost(Y, peer, Y.encodeStateAsUpdate(host)), { shared: true, missing: null });
  });

  it("leaves a note the host started again from its text alone", () => {
    const host = new Y.Doc();
    host.getText("content").insert(0, "note\n");
    const peer = new Y.Doc();
    peer.getText("content").insert(0, "note\n");
    // Sending this peer's copy would write the note out twice.
    assert.deepEqual(compareWithHost(Y, peer, Y.encodeStateAsUpdate(host)), { shared: false, missing: null });
  });

  it("fills a host that came back empty", () => {
    const empty = new Y.Doc();
    const peer = new Y.Doc();
    peer.getText("content").insert(0, "all of it\n");
    const { shared, missing } = compareWithHost(Y, peer, Y.encodeStateAsUpdate(empty));
    assert.equal(shared, true);
    Y.applyUpdate(empty, missing);
    assert.equal(text(empty), "all of it\n");
  });
});
