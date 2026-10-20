// A drive that went bad answered 200 and never sent the body, and opening a
// note waited on it forever. The body now has to arrive in time too.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { fetchBytesWithTimeout } from "../fetch-bytes.js";

describe("reading a note's copy", () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/stalls") {
      // Headers, part of the body, then nothing.
      res.writeHead(200, { "Content-Length": "100" });
      res.write("PMD1");
      return;
    }
    if (req.url === "/missing") {
      res.writeHead(404);
      return res.end("not here");
    }
    res.end("PMD1 sealed");
  });
  const ready = new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = async (path) => {
    await ready;
    return `http://127.0.0.1:${server.address().port}${path}`;
  };
  after(() => {
    server.closeAllConnections();
    server.close();
  });

  it("gives up on a body that never arrives, instead of waiting forever", async () => {
    const started = Date.now();
    await assert.rejects(fetchBytesWithTimeout(await url("/stalls"), 300), { name: "AbortError" });
    assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
  });

  it("returns the whole body when it comes", async () => {
    const reply = await fetchBytesWithTimeout(await url("/copy"), 2000);
    assert.equal(reply.ok, true);
    assert.equal(new TextDecoder().decode(reply.bytes), "PMD1 sealed");
  });

  it("says what a drive answered when it has no such copy", async () => {
    const reply = await fetchBytesWithTimeout(await url("/missing"), 2000);
    assert.deepEqual([reply.ok, reply.status, reply.bytes], [false, 404, null]);
  });
});
