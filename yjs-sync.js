// A reconnect can find the host restarted from an older save, without edits
// this peer already has. Updates sent after that build on them, so the host
// could never apply them and the note split in two: the host on one copy,
// everyone else on another. On every connection the two compare, and this
// peer takes what the host has and sends what it lacks.
//
// Only between copies of the same note: a host that started the note again
// from its text shares no history with it, and sending everything would write
// the note out twice. That case is left as it was.
//
// Mirrors compareWithHost in peersky-mobile's backend/p2pmd/server.mjs.
export function compareWithHost(Y, doc, hostState) {
  const hostVector = Y.encodeStateVectorFromUpdate(hostState);
  const host = Y.decodeStateVector(hostVector);
  const local = Y.decodeStateVector(Y.encodeStateVector(doc));
  const shared = local.size === 0 || host.size === 0 || [...local.keys()].some((client) => host.has(client));
  if (!shared) return { shared: false, missing: null };
  const missing = Y.encodeStateAsUpdate(doc, hostVector);
  // An update with nothing in it is two empty lists.
  return { shared: true, missing: missing.byteLength > 2 ? missing : null };
}
