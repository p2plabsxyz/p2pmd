// The notes this computer opened before, for the start screen, as the phone
// lists them: every one, newest first, with a search box once there are
// many. It showed the last five, and a note left only appeared after a reload.

// Past this many notes the list gets a search box, as on the phone.
export const RECENT_SEARCH_AFTER = 10;

// A private note's key is the secret its host's keys are made from,
// hs://s000..., and a public note's is the host's public key, hs://0000...
export function isPrivateNoteKey(key) {
  return /^hs:\/\/s/i.test(String(key || "").trim());
}

// Saved note states as the page keeps them, one for each spelling of a key:
// each note once, its newest state, newest first, and not the ones taken off
// the list. A state saved again when the note is opened has no mark, so it
// comes back then.
export function collectRecentNotes(states) {
  const newest = new Map();
  for (const state of states || []) {
    const key = typeof state?.key === "string" ? state.key.trim() : "";
    if (!key) continue;
    const savedAt = Number(state.savedAt) || 0;
    const known = newest.get(key);
    if (known && known.savedAt >= savedAt) continue;
    newest.set(key, {
      key,
      savedAt,
      hosted: Boolean(state.hosted || state.isHosted || state.creator),
      hidden: state.hiddenFromRecents === true,
    });
  }
  return [...newest.values()]
    .filter((note) => !note.hidden)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(({ hidden, ...note }) => note);
}

export function filterRecentNotes(notes, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => [note.label, note.key]
    .some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(needle)));
}

// What a note is called in the list when its text has no heading yet.
export function shortNoteKey(key) {
  const value = String(key || "").replace(/^hs:\/\//i, "");
  return value.length > 20 ? `${value.slice(0, 20)}...` : value;
}
