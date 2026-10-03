// The first time P2PMD opens on a computer it says what it is, the way the
// phone app does, before the name page.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { P2PMD_WELCOME } from "../app-welcome.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("the P2PMD welcome", () => {
  it("says what P2PMD is in four points, worded for a computer", () => {
    assert.equal(P2PMD_WELCOME.id, "p2pmd");
    assert.equal(P2PMD_WELCOME.title, "P2PMD");
    assert.deepEqual(P2PMD_WELCOME.points.map((point) => point.title), [
      "Write together, live",
      "Your computer is the server",
      "Private from the start",
      "Slides and publishing",
    ]);
    for (const point of P2PMD_WELCOME.points) {
      assert.match(point.icon, /^<svg aria-hidden="true" focusable="false"/);
      assert.doesNotMatch(`${point.title} ${point.body}`, /—|your phone/i);
    }
    assert.equal(P2PMD_WELCOME.action, "Start writing");
  });

  it("comes before the app's own scripts, once per computer", async () => {
    const html = await read("index.html");
    assert.ok(html.indexOf('src="./app-welcome.js"') < html.indexOf('src="./common.js"'));
    const welcome = await read("welcome.js");
    assert.match(welcome, /localStorage\.getItem\(storageKey\(id\)\) === "seen"/);
    assert.match(welcome, /localStorage\.setItem\(storageKey\(welcome\.id\), "seen"\)/);
    assert.match(welcome, /@media \(prefers-reduced-motion: reduce\)/);
    // Text goes in as text. Only the file's own icons are markup.
    assert.doesNotMatch(welcome.replace(/badge\.innerHTML = point\.icon;/, ""), /innerHTML/);
  });
});
