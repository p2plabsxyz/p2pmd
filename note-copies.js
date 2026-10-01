// The copies of notes this device keeps for itself, on its p2pmd-drafts drive.
//
// That drive is never published, but Settings lists its address with the other
// app drives, so nothing on it may be readable from the address alone. A copy
// is named after a hash of its note's key and sealed with AES-256-GCM under a
// key made from the note's key, the way PeerChat seals attachments. Opening one
// takes the note's key, which only the people in the note have.
//
// Copies used to sit in rooms/ on the p2pmd drive, the one "Publish to hyper://"
// writes to, each named after its note's key. Anyone given a published link
// could list that folder, read every note, and join any private one. They now
// move here and are deleted there, though the history of that drive keeps
// what was written to it.
//
// Sealed file layout:
//   "PMD1" (4 bytes) | 12-byte random IV | AES-256-GCM ciphertext, 16-byte tag last
// key  = sha256("p2pmd:note-copy-key:" + note key)
// name = "notes/" + first 32 hex of sha256("p2pmd:note-copy-name:" + note key) + "." + kind
// The note key is always in its hs:// form, so either spelling finds the same copy.
// WebCrypto, so this runs in the page and in tests.

import { canonicalNoteKey } from "./notes-transfer.js";

const KEY_CONTEXT = "p2pmd:note-copy-key:";
const NAME_CONTEXT = "p2pmd:note-copy-name:";
const MAGIC = new Uint8Array([0x50, 0x4d, 0x44, 0x31]); // "PMD1"
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const NOTE_COPY_FOLDER = "notes/";
// The text, who wrote which line, and the editor's draft.
export const NOTE_COPY_KINDS = ["copy", "lines", "draft"];

const subtle = globalThis.crypto?.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Where on the drafts drive this note's copy of one kind is kept. */
export async function noteCopyPath(noteKey, kind) {
  const key = requireNoteKey(noteKey);
  if (!NOTE_COPY_KINDS.includes(kind)) throw new Error("Unknown kind of note copy");
  return `${NOTE_COPY_FOLDER}${toHex(await sha256(NAME_CONTEXT + key)).slice(0, 32)}.${kind}`;
}

export async function sealNoteCopy(noteKey, text) {
  const key = await deriveCopyKey(noteKey);
  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(String(text))));
  const out = new Uint8Array(MAGIC.length + IV_BYTES + sealed.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(sealed, MAGIC.length + IV_BYTES);
  return out;
}

export async function openNoteCopy(noteKey, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < MAGIC.length + IV_BYTES + TAG_BYTES || !MAGIC.every((b, i) => bytes[i] === b)) {
    throw new Error("Not a sealed note copy");
  }
  const key = await deriveCopyKey(noteKey);
  try {
    const plain = await subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(MAGIC.length, MAGIC.length + IV_BYTES) },
      key,
      bytes.subarray(MAGIC.length + IV_BYTES),
    );
    return decoder.decode(plain);
  } catch {
    throw new Error("Note copy could not be opened");
  }
}

/**
 * Where a copy of this kind was kept before, by the spellings the editor used
 * for its key: on the publish drive for the text and the line authors, at the
 * top of the drafts drive for the draft. Paths only; which drive is the
 * caller's to add.
 */
export function legacyNoteCopyPaths(noteKey, kind) {
  const key = requireNoteKey(noteKey);
  const bare = key.slice("hs://".length);
  return [`hs_${bare}`, bare].map((name) => {
    if (kind === "copy") return `rooms/${name}.md`;
    if (kind === "lines") return `rooms/${name}.line-attributions.json`;
    if (kind === "draft") return `${name}.json`;
    throw new Error("Unknown kind of note copy");
  });
}

/**
 * The note and kind of a file left from before, from its name in rooms/ on the
 * publish drive, or in the top of the drafts drive. Null for anything else.
 */
export function legacyNoteCopyOf(fileName, place) {
  if (typeof fileName !== "string") return null;
  const pattern = place === "rooms"
    ? /^(?:hs_)?([a-z0-9]{32,256})\.(md|line-attributions\.json)$/i
    : /^(?:hs_)?([a-z0-9]{32,256})\.(json)$/i;
  const match = pattern.exec(fileName);
  if (!match) return null;
  const key = canonicalNoteKey(match[1]);
  if (!key) return null;
  const kind = match[2] === "md" ? "copy" : match[2] === "json" ? "draft" : "lines";
  return { key, kind };
}

function requireNoteKey(noteKey) {
  const key = canonicalNoteKey(noteKey);
  if (!key) throw new Error("Invalid note key");
  return key;
}

async function deriveCopyKey(noteKey) {
  const raw = await sha256(KEY_CONTEXT + requireNoteKey(noteKey));
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function sha256(text) {
  return new Uint8Array(await subtle.digest("SHA-256", encoder.encode(text)));
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
