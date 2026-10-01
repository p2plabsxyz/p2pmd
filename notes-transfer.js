// Notes going to another of this person's devices, and notes coming from one.
//
// Only what means the same thing on every device travels: a note's key, the
// name it is listed under, and, for a note this device hosts, its text. A
// drive address, a port or a seed belongs to the machine that made it. A
// copied profile that kept one sent every write to a drive the new machine
// could not write to (#18), so none of them go, and none are taken.
//
// A note this device hosts goes with its text, and both devices then open it
// the same way: they join it if the other one has it open, and only when
// nobody does, they host their own copy. That takes a private note: its key
// (hs://s000...) is what the host's keys are made from, so any device holding
// it hosts the same note. A note that is not private has the host's public key
// in its address, and only the device that made it can ever host it. That
// one, like a note this device only joined, goes as a note to join.
//
// Mirror of backend/p2pmd/notes-transfer.mjs in peersky-mobile. Both read and
// write the same JSON, version 1. Keep them in step.

import { describeP2pmdNote } from "./note-title.js";

export const NOTES_TRANSFER_VERSION = 1;
// The recent list shows five, here and on the phone.
export const MAX_TRANSFER_NOTES = 5;
// A device takes at most 4 MiB in one file, so the text stays well under it.
export const MAX_TRANSFER_TEXT_BYTES = 3 * 1024 * 1024;

const ROOM_STATE_PREFIX = "p2pmd-room-";
const ROOM_CONTENT_PREFIX = "p2pmd-room-content-";
// Kept under the same prefix as the room states, and never one of them.
const NOT_ROOM_STATES = [ROOM_CONTENT_PREFIX, "p2pmd-room-line-attributions-", "p2pmd-room-local-line-attributions-"];
const DISPLAY_NAME_KEY = "p2pmd-display-name";
const KEY_VALUE = /^[a-z0-9]{32,256}$/i;
const MAX_LABEL_LENGTH = 64;
const MAX_NAME_LENGTH = 32;

/** Whether any device holding this key can host the note: a private one. */
export function isPrivateNoteKey(key) {
  return /^hs:\/\/s[a-z0-9]{3}/i.test(key);
}

/** A note's key as `hs://...`, or "" when it is not one. */
export function canonicalNoteKey(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const base = trimmed.toLowerCase().startsWith("hs://") ? trimmed.slice(5) : trimmed;
  return KEY_VALUE.test(base) ? `hs://${base}` : "";
}

/**
 * What this device sends: its name and its five most recent notes. The hosted
 * ones carry their text, as long as it fits, and are marked shared here, so
 * this device too joins them first from now on.
 */
export function exportNotes(storage) {
  const recent = [...readRoomStates(storage).values()]
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, MAX_TRANSFER_NOTES);

  let budget = MAX_TRANSFER_TEXT_BYTES;
  const notes = [];
  for (const { key, state, savedAt } of recent) {
    const text = readContent(storage, key);
    const role = isHosted(state) && isPrivateNoteKey(key) ? "host" : "client";
    let content = null;
    if (role === "host" && text !== null && byteLength(text) <= budget) {
      content = text;
      budget -= byteLength(text);
    }
    notes.push({
      key,
      role,
      label: text ? normalizeLabel(describeP2pmdNote(text).label) : "",
      ...(content !== null && { content }),
      updatedAt: savedAt,
      openedAt: savedAt,
    });
    if (content !== null) writeState(storage, key, { ...state, key, shared: true });
  }

  return {
    version: NOTES_TRANSFER_VERSION,
    name: normalizeName(safeGet(storage, DISPLAY_NAME_KEY)),
    notes,
  };
}

/**
 * Takes notes from another device. Nothing here is replaced: a note already
 * on this device keeps its own text, and a name already chosen stays.
 * Returns { ok, added }.
 */
export function importNotes(storage, transfer) {
  const incoming = normalizeNotesTransfer(transfer);
  if (!incoming) return { ok: false, added: 0 };

  const known = readRoomStates(storage);
  let added = 0;
  for (const note of incoming.notes) {
    const existing = known.get(note.key)?.state || null;
    if (!existing) added += 1;

    if (note.role === "client") {
      if (!existing) writeState(storage, note.key, { key: note.key, savedAt: note.openedAt });
      continue;
    }

    // Only a note with a copy here can ever be hosted from it. Without one,
    // hosting would put an empty note up in place of the real one.
    const hasCopy = note.content !== undefined || readContent(storage, note.key) !== null;
    if (note.content !== undefined && readContent(storage, note.key) === null) {
      safeSet(storage, `${ROOM_CONTENT_PREFIX}${note.key}`, note.content);
    }
    writeState(storage, note.key, existing
      ? { ...existing, key: existing.key || note.key, shared: true, ...(hasCopy && { creator: true }) }
      : { key: note.key, savedAt: note.openedAt, shared: true, ...(hasCopy && { creator: true }) });
  }

  if (incoming.name && !normalizeName(safeGet(storage, DISPLAY_NAME_KEY))) {
    safeSet(storage, DISPLAY_NAME_KEY, incoming.name);
  }
  return { ok: true, added };
}

/**
 * The transfer as this device takes it, or null. Every field is checked and
 * anything else is dropped, so nothing else in a transfer can reach storage.
 */
export function normalizeNotesTransfer(value) {
  if (!value || typeof value !== "object" || value.version !== NOTES_TRANSFER_VERSION || !Array.isArray(value.notes)) {
    return null;
  }

  let budget = MAX_TRANSFER_TEXT_BYTES;
  const seen = new Set();
  const notes = [];
  for (const item of value.notes.slice(0, MAX_TRANSFER_NOTES)) {
    const key = canonicalNoteKey(item?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // Only a private note can be hosted anywhere else, whatever a sender says.
    const role = item.role === "host" && isPrivateNoteKey(key) ? "host" : "client";
    let content;
    if (role === "host" && typeof item.content === "string" && byteLength(item.content) <= budget) {
      content = item.content;
      budget -= byteLength(item.content);
    }
    notes.push({
      key,
      role,
      label: normalizeLabel(item.label),
      ...(content !== undefined && { content }),
      updatedAt: timestamp(item.updatedAt),
      openedAt: timestamp(item.openedAt),
    });
  }

  return { version: NOTES_TRANSFER_VERSION, name: normalizeName(value.name), notes };
}

// Each note once, by its hs:// key, with the newest state stored for it. A
// state is written under the key with and without hs://, and either is the
// same note.
function readRoomStates(storage) {
  const states = new Map();
  for (const name of storageKeys(storage)) {
    if (!name.startsWith(ROOM_STATE_PREFIX) || NOT_ROOM_STATES.some((prefix) => name.startsWith(prefix))) continue;
    let state;
    try {
      state = JSON.parse(safeGet(storage, name) || "null");
    } catch {
      continue;
    }
    if (!state || typeof state !== "object" || Array.isArray(state)) continue;
    const key = canonicalNoteKey(state.key);
    if (!key) continue;
    const savedAt = timestamp(state.savedAt);
    const existing = states.get(key);
    if (!existing || savedAt > existing.savedAt) states.set(key, { key, state, savedAt });
  }
  return states;
}

function writeState(storage, key, state) {
  const payload = JSON.stringify(state);
  for (const name of [key, key.slice("hs://".length)]) {
    safeSet(storage, `${ROOM_STATE_PREFIX}${name}`, payload);
  }
}

function readContent(storage, key) {
  for (const name of [key, key.slice("hs://".length)]) {
    const value = safeGet(storage, `${ROOM_CONTENT_PREFIX}${name}`);
    if (typeof value === "string") return value;
  }
  return null;
}

// The same test the editor uses to decide whether to host a note again.
function isHosted(state) {
  return Boolean(state.hosted || state.isHosted || state.creator);
}

function storageKeys(storage) {
  const names = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (typeof name === "string") names.push(name);
    }
  } catch {}
  return names;
}

function normalizeLabel(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH) : "";
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH) : "";
}

function timestamp(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function safeGet(storage, name) {
  try {
    return storage.getItem(name);
  } catch {
    return null;
  }
}

function safeSet(storage, name, value) {
  try {
    storage.setItem(name, value);
  } catch {}
}
