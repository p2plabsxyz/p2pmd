// Notes moving between a person's devices. What has to hold: a note arrives
// with its name and, when it was hosted, its text; nothing tied to the machine
// it came from travels (the cached drive address in #18 sent every write on a
// copied profile to a drive it could not write to); and nothing already on
// the receiving device is replaced.
//
// The transfer in "reads the transfer the phone reads" is the same one
// test/protocol/p2pmd-notes-transfer.test.mjs in peersky-mobile checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_TRANSFER_NOTES,
  MAX_TRANSFER_TEXT_BYTES,
  canonicalNoteKey,
  exportNotes,
  importNotes,
  isPrivateNoteKey,
  normalizeNotesTransfer,
} from "../notes-transfer.js";

class MemoryStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(name) {
    return this.map.has(name) ? this.map.get(name) : null;
  }

  setItem(name, value) {
    this.map.set(name, String(value));
  }
}

// Private notes, the only kind another device can host: the key is what the
// host's keys are made from.
const key = (letter) => `hs://s000${letter.repeat(52)}`;
// What a note that is not private looks like: the host's public key.
const publicKey = (letter) => `hs://0000${letter.repeat(52)}`;
const base = (noteKey) => noteKey.slice("hs://".length);

// A room the way the editor leaves it: the state under both forms of the key,
// and the text it last had.
function room(storage, noteKey, state, content) {
  const payload = JSON.stringify({ key: noteKey, ...state });
  storage.setItem(`p2pmd-room-${noteKey}`, payload);
  storage.setItem(`p2pmd-room-${base(noteKey)}`, payload);
  if (content !== undefined) storage.setItem(`p2pmd-room-content-${noteKey}`, content);
}

function state(storage, noteKey) {
  return JSON.parse(storage.getItem(`p2pmd-room-${noteKey}`));
}

describe("notes going to another device", () => {
  it("sends a hosted note with its text, and a joined one without", () => {
    const storage = new MemoryStorage({ "p2pmd-display-name": "  Ada   Lovelace " });
    room(storage, key("a"), { savedAt: 2000, hosted: true, creator: true }, "# Plans\n\nFirst draft");
    room(storage, key("b"), { savedAt: 1000, hosted: false }, "# Their notes\n\nnot ours");

    const transfer = exportNotes(storage);

    assert.equal(transfer.version, 1);
    assert.equal(transfer.name, "Ada Lovelace");
    assert.deepEqual(transfer.notes, [
      { key: key("a"), role: "host", label: "Note - Plans", content: "# Plans\n\nFirst draft", updatedAt: 2000, openedAt: 2000 },
      { key: key("b"), role: "client", label: "Note - Their notes", updatedAt: 1000, openedAt: 1000 },
    ]);
  });

  it("marks what it sends as shared, so this device looks for it elsewhere first too", () => {
    const storage = new MemoryStorage();
    room(storage, key("a"), { savedAt: 2000, creator: true }, "text");
    room(storage, key("b"), { savedAt: 1000 }, "theirs");

    exportNotes(storage);

    assert.equal(state(storage, key("a")).shared, true);
    assert.equal(JSON.parse(storage.getItem(`p2pmd-room-${base(key("a"))}`)).shared, true);
    assert.equal(state(storage, key("b")).shared, undefined);
  });

  it("sends the five most recent, each once", () => {
    const storage = new MemoryStorage();
    for (const [index, letter] of ["a", "b", "c", "d", "e", "f", "g"].entries()) {
      room(storage, key(letter), { savedAt: 1000 + index }, "");
    }
    // An older state under the bare key must not bring the note back twice.
    storage.setItem(`p2pmd-room-${base(key("g"))}`, JSON.stringify({ key: base(key("g")), savedAt: 1 }));

    const notes = exportNotes(storage).notes;

    assert.equal(notes.length, MAX_TRANSFER_NOTES);
    assert.deepEqual(notes.map((note) => note.key), ["g", "f", "e", "d", "c"].map(key));
  });

  it("leaves the text out when it would not fit", () => {
    const storage = new MemoryStorage();
    room(storage, key("a"), { savedAt: 2, creator: true }, "x".repeat(MAX_TRANSFER_TEXT_BYTES + 1));
    room(storage, key("b"), { savedAt: 1, creator: true }, "fits");

    const [big, small] = exportNotes(storage).notes;

    assert.equal(big.role, "host");
    assert.equal(big.content, undefined);
    assert.equal(small.content, "fits");
    // Not marked shared: without its text the other device cannot host it.
    assert.equal(state(storage, key("a")).shared, undefined);
  });

  it("never sends anything tied to this machine", () => {
    const storage = new MemoryStorage({
      "p2pmd:hyperdriveUrl": "hyper://drive-only-this-mac-can-write/",
      "p2pmd:draftDriveUrl": "hyper://drafts-only-this-mac-can-write/",
    });
    room(storage, key("a"), {
      savedAt: 1,
      creator: true,
      localUrl: "http://127.0.0.1:8989",
      host: "127.0.0.1",
      port: 8989,
      seed: "5eed".repeat(16),
      hyperdriveUrl: "hyper://drive-only-this-mac-can-write/",
    }, "text");

    const sent = JSON.stringify(exportNotes(storage));

    for (const machineOnly of ["127.0.0.1", "8989", "hyper://", "seed", "localUrl", "port", "5eed"]) {
      assert.equal(sent.includes(machineOnly), false, `sent ${machineOnly}`);
    }
  });
});

describe("a note that is not private", () => {
  it("goes as one to join: only the device that made it can host it", () => {
    const storage = new MemoryStorage();
    room(storage, publicKey("a"), { savedAt: 2, hosted: true, creator: true }, "# Desk only");

    const [note] = exportNotes(storage).notes;

    assert.deepEqual(note, { key: publicKey("a"), role: "client", label: "Note - Desk only", updatedAt: 2, openedAt: 2 });
    // Still this device's own to host, straight away as before.
    assert.equal(state(storage, publicKey("a")).shared, undefined);
  });

  it("is taken as one to join, whatever the other device says", () => {
    const storage = new MemoryStorage();

    importNotes(storage, { version: 1, notes: [{ key: publicKey("a"), role: "host", content: "text", openedAt: 3 }] });

    assert.deepEqual(state(storage, publicKey("a")), { key: publicKey("a"), savedAt: 3 });
    assert.equal(storage.getItem(`p2pmd-room-content-${publicKey("a")}`), null);
  });

  it("is told apart by its key", () => {
    assert.equal(isPrivateNoteKey(key("a")), true);
    assert.equal(isPrivateNoteKey(publicKey("a")), false);
    assert.equal(isPrivateNoteKey(""), false);
  });
});

describe("notes coming from another device", () => {
  it("adds them to the recent list, ready to join first and host a copy only when nobody answers", () => {
    const storage = new MemoryStorage();

    const result = importNotes(storage, {
      version: 1,
      name: "Ada",
      notes: [
        { key: key("a"), role: "host", label: "Note - Plans", content: "# Plans", updatedAt: 5, openedAt: 7 },
        { key: key("b"), role: "client", label: "Note - Theirs", updatedAt: 3, openedAt: 4 },
      ],
    });

    assert.deepEqual(result, { ok: true, added: 2 });
    assert.deepEqual(state(storage, key("a")), { key: key("a"), savedAt: 7, shared: true, creator: true });
    assert.equal(storage.getItem(`p2pmd-room-content-${key("a")}`), "# Plans");
    assert.deepEqual(state(storage, key("b")), { key: key("b"), savedAt: 4 });
    assert.equal(storage.getItem(`p2pmd-room-content-${key("b")}`), null);
    assert.equal(storage.getItem("p2pmd-display-name"), "Ada");
  });

  it("replaces nothing already here", () => {
    const storage = new MemoryStorage({ "p2pmd-display-name": "Mine" });
    room(storage, key("a"), { savedAt: 50, creator: true, localUrl: "http://127.0.0.1:9000" }, "my newer text");

    importNotes(storage, {
      version: 1,
      name: "Theirs",
      notes: [{ key: key("a"), role: "host", content: "their older text", openedAt: 1 }],
    });

    assert.equal(storage.getItem(`p2pmd-room-content-${key("a")}`), "my newer text");
    assert.equal(storage.getItem("p2pmd-display-name"), "Mine");
    assert.deepEqual(state(storage, key("a")), {
      key: key("a"), savedAt: 50, creator: true, localUrl: "http://127.0.0.1:9000", shared: true,
    });
  });

  it("never hosts a note it has no copy of", () => {
    const storage = new MemoryStorage();

    importNotes(storage, { version: 1, notes: [{ key: key("a"), role: "host", openedAt: 1 }] });

    // Shared, so it is looked for, but nothing to host: an empty note would
    // go up in place of the real one.
    assert.deepEqual(state(storage, key("a")), { key: key("a"), savedAt: 1, shared: true });
  });

  it("writes nothing it does not understand", () => {
    const storage = new MemoryStorage();

    importNotes(storage, {
      version: 1,
      hyperdriveUrl: "hyper://someone-elses-drive/",
      notes: [{
        key: key("a"),
        role: "host",
        content: "text",
        openedAt: 1,
        localUrl: "http://127.0.0.1:8989",
        port: 8989,
        seed: "5eed".repeat(16),
        draftDriveUrl: "hyper://someone-elses-drafts/",
      }],
    });

    const written = JSON.stringify([...storage.map]);
    for (const foreign of ["hyper://", "127.0.0.1", "8989", "5eed"]) {
      assert.equal(written.includes(foreign), false, `wrote ${foreign}`);
    }
    assert.equal(storage.getItem("p2pmd:hyperdriveUrl"), null);
  });

  it("refuses anything that is not a transfer, and touches nothing", () => {
    for (const bad of [null, "text", { version: 2, notes: [] }, { version: 1 }, { version: 1, notes: {} }]) {
      const storage = new MemoryStorage();
      assert.deepEqual(importNotes(storage, bad), { ok: false, added: 0 });
      assert.equal(storage.length, 0);
    }
  });
});

describe("the transfer itself", () => {
  it("knows a note key in either form and nothing else", () => {
    assert.equal(canonicalNoteKey(` ${base(key("a"))} `), key("a"));
    assert.equal(canonicalNoteKey(key("a")), key("a"));
    assert.equal(canonicalNoteKey("hs://short"), "");
    assert.equal(canonicalNoteKey(`hs://${"a".repeat(40)}/path`), "");
    assert.equal(canonicalNoteKey(`hs://${"é".repeat(40)}`), "");
    assert.equal(canonicalNoteKey(42), "");
  });

  it("reads the transfer the phone reads", () => {
    const transfer = {
      version: 1,
      name: "  Bea  ",
      extra: "dropped",
      notes: [
        { key: base(key("q")), role: "host", label: " Note -\n Trip  ", content: "# Trip", updatedAt: 10, openedAt: 20, localUrl: "x" },
        { key: key("q"), role: "host", content: "a second copy of the same note" },
        { key: "hs://not-a-key", role: "client" },
        { key: key("r"), role: "anything", content: "a joined note never carries text", updatedAt: -1, openedAt: "soon" },
      ],
    };

    assert.deepEqual(normalizeNotesTransfer(transfer), {
      version: 1,
      name: "Bea",
      notes: [
        { key: key("q"), role: "host", label: "Note - Trip", content: "# Trip", updatedAt: 10, openedAt: 20 },
        { key: key("r"), role: "client", label: "", updatedAt: 0, openedAt: 0 },
      ],
    });
  });

  it("keeps the text within one budget across every note", () => {
    const half = "y".repeat(MAX_TRANSFER_TEXT_BYTES / 2 + 1);
    const notes = normalizeNotesTransfer({
      version: 1,
      notes: [
        { key: key("a"), role: "host", content: half },
        { key: key("b"), role: "host", content: half },
      ],
    }).notes;

    assert.equal(notes[0].content, half);
    assert.equal(notes[1].content, undefined);
  });
});
