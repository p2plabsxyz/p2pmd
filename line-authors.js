// Who wrote which line of a note, the same on every device.
//
// Each editor files the lines it writes under its person, and the host passes
// everyone's lists around. An editor kept a line as its own after someone else
// rewrote it, and a phone's lines stayed on their old numbers when someone
// else added lines above them, so a phone in a laptop's note showed the
// laptop's lines as its own while the laptop showed the phone's lines as the
// laptop's. This says which lines a change wrote on, by one rule for whoever
// typed it and for everyone who receives it.
//
// The phone keeps the same rules in peersky-mobile's
// backend/p2pmd/line-authors.mjs, and the desktop host in peersky-browser's
// src/protocols/p2pmd-line-authors.js. They have to agree.

/**
 * Where each line of oldText went in a change, and which lines of the new text
 * the change wrote on. delta is the Yjs delta that turned oldText into the new
 * text. A line whose text is gone, or that joined the line above it, is not in
 * moved. firstLine is the first line of the new text the change reached, or 0
 * for no change.
 */
export function lineChangesFromDelta(oldText, delta) {
  const text = typeof oldText === "string" ? oldText : "";
  const moved = new Map();
  const written = new Set();
  let oldPos = 0;
  let oldLine = 1;
  let newLine = 1;
  let newAtLineStart = true;
  let lineSettled = false;
  let lastMovedTo = 0;
  let firstLine = 0;

  const keep = (count) => {
    const end = Math.min(text.length, oldPos + Math.max(0, count));
    while (oldPos < end) {
      // A line goes where its first kept character lands, unless an earlier
      // line is already there: then it joined that one.
      if (!lineSettled) {
        lineSettled = true;
        if (newLine !== lastMovedTo) {
          moved.set(oldLine, newLine);
          lastMovedTo = newLine;
        }
      }
      const char = text[oldPos];
      oldPos += 1;
      if (char === "\n") {
        oldLine += 1;
        newLine += 1;
        lineSettled = false;
        newAtLineStart = true;
      } else {
        newAtLineStart = false;
      }
    }
  };

  const remove = (count) => {
    const end = Math.min(text.length, oldPos + Math.max(0, count));
    const removed = text.slice(oldPos, end);
    if (removed.length === 0) return;
    if (!firstLine) firstLine = newLine;
    // Taking characters out of one line writes on it. Taking out a line break
    // joins two lines, which writes on neither.
    if (!removed.includes("\n")) written.add(newLine);
    for (let index = 0; index < removed.length; index++) {
      if (removed[index] === "\n") {
        oldLine += 1;
        lineSettled = false;
      }
    }
    oldPos = end;
  };

  const insert = (value) => {
    if (!value) return;
    if (!firstLine) firstLine = newLine;
    let breaks = 0;
    for (let index = 0; index < value.length; index++) {
      if (value[index] === "\n") breaks += 1;
    }
    // A line break typed after text starts a new line below it: the new line
    // is written on, the line it was typed after is not.
    const startsWithBreak = value[0] === "\n";
    const endsWithBreak = value[value.length - 1] === "\n";
    let start = newLine;
    let count = breaks + (endsWithBreak ? 0 : 1);
    if (!newAtLineStart && startsWithBreak) {
      start += 1;
      count -= 1;
    }
    count = Math.max(1, count);
    for (let line = start; line < start + count; line++) written.add(line);
    newLine += breaks;
    newAtLineStart = endsWithBreak;
  };

  for (const op of Array.isArray(delta) ? delta : []) {
    if (!op || typeof op !== "object") continue;
    if (typeof op.retain === "number") keep(op.retain);
    else if (typeof op.delete === "number") remove(op.delete);
    else if (typeof op.insert === "string") insert(op.insert);
  }
  // Yjs leaves out the text kept at the end.
  keep(text.length - oldPos);
  // A last line with no text of its own: after a final line break, or the one
  // line of an empty note.
  const lastLineEmpty = text.length === 0 || text[text.length - 1] === "\n";
  if (!lineSettled && lastLineEmpty && newLine !== lastMovedTo) moved.set(oldLine, newLine);

  return { moved, written, firstLine };
}

/** A list of line authors without the lines past the end of the note. */
export function trimLineAuthors(authors, lineCount) {
  if (!authors || typeof authors !== "object") return { changed: false, map: authors };
  let changed = false;
  const kept = {};
  for (const [line, author] of Object.entries(authors)) {
    if (Number(line) > lineCount) {
      changed = true;
      continue;
    }
    kept[line] = author;
  }
  return changed ? { changed: true, map: kept } : { changed: false, map: authors };
}
