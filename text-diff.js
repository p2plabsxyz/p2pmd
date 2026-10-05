// What one edit of the textarea changed, as one delete and one insert.
//
// Trimming what matches at both ends finds what changed, but not always where:
// a line break typed next to another one could be either, and the CRDT keeps
// the place it is given. Trimming picked the later one, so a line typed just
// before a note's last line break went after it, into whatever someone else
// was typing at the end. Typing leaves the caret right after what was typed, or
// where text was deleted, so when the caret fits the change it says where.
//
// Mirrors diffTextChange in peersky-mobile's backend/p2pmd/server.mjs.
export function diffTextChange(oldText, newText, caret = null) {
  const oldValue = typeof oldText === "string" ? oldText : "";
  const newValue = typeof newText === "string" ? newText : "";

  const grown = newValue.length - oldValue.length;
  if (Number.isInteger(caret) && caret >= 0 && caret <= newValue.length && grown !== 0) {
    if (grown > 0 && caret >= grown) {
      const at = caret - grown;
      if (newValue.startsWith(oldValue.slice(0, at)) && newValue.endsWith(oldValue.slice(at))) {
        return { prefixLen: at, oldSuffix: at, newSuffix: caret };
      }
    } else if (grown < 0 && oldValue.startsWith(newValue.slice(0, caret)) && oldValue.endsWith(newValue.slice(caret))) {
      return { prefixLen: caret, oldSuffix: caret - grown, newSuffix: caret };
    }
  }

  let prefixLen = 0;
  let oldSuffix = oldValue.length;
  let newSuffix = newValue.length;

  const isPurePrepend = newValue.length > oldValue.length && newValue.endsWith(oldValue);
  const isPureAppend = newValue.length > oldValue.length && newValue.startsWith(oldValue);

  if (isPurePrepend) {
    prefixLen = 0;
    oldSuffix = 0;
    newSuffix = newValue.length - oldValue.length;
  } else if (isPureAppend) {
    prefixLen = oldValue.length;
    oldSuffix = oldValue.length;
    newSuffix = newValue.length;
  } else {
    // Trim unchanged edges so we emit one minimal delete/insert change.
    const minLen = Math.min(oldValue.length, newValue.length);
    while (prefixLen < minLen && oldValue[prefixLen] === newValue[prefixLen]) prefixLen++;
    while (oldSuffix > prefixLen && newSuffix > prefixLen &&
          oldValue[oldSuffix - 1] === newValue[newSuffix - 1]) {
      oldSuffix--;
      newSuffix--;
    }
  }

  return { prefixLen, oldSuffix, newSuffix };
}
