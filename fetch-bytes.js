// A read whose body has to arrive in time too. fetch's own signal is cleared
// once the headers are in, so a drive that answered 200 and then never sent
// the body held a note's opening up forever: two linked desktops share their
// p2pmd-drafts drive, and once both had written to it, Hypercore closed it as a
// conflict, after which every read there stalled. Join did nothing.
export async function fetchBytesWithTimeout(url, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    const bytes = response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    return { ok: response.ok, status: response.status, bytes };
  } finally {
    clearTimeout(timer);
  }
}
