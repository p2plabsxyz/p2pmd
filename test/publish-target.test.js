// Publishing to hyper:// asks who can open the note, as the phone does: anyone
// with the link, or only your own linked devices.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  normalizePublishVisibility,
  publishDriveRequestUrl,
  PUBLISH_DRIVE_NAME,
  PUBLISH_VISIBILITY_HELP,
} from "../publish-target.js";

describe("who can open a published note", () => {
  it("keeps the public drive's request as it always was, so old links stay on the same drive", () => {
    assert.equal(PUBLISH_DRIVE_NAME, "p2pmd");
    assert.equal(publishDriveRequestUrl("public"), "hyper://localhost/?key=p2pmd");
  });

  it("asks PeerSky for the private drive of the same name", () => {
    assert.equal(publishDriveRequestUrl("private"), "hyper://localhost/?key=p2pmd&visibility=private");
  });

  it("treats anything but private as public", () => {
    assert.equal(normalizePublishVisibility("private"), "private");
    assert.equal(normalizePublishVisibility("public"), "public");
    assert.equal(normalizePublishVisibility(undefined), "public");
    assert.equal(normalizePublishVisibility("Private"), "public");
    assert.match(PUBLISH_VISIBILITY_HELP.private, /only your own linked devices/);
  });

  it("shows the choice next to hyper:// and sends it with Publish", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const app = await readFile(new URL("../p2p.js", import.meta.url), "utf8");
    assert.match(html, /<option value="hyper" selected>hyper:\/\/<\/option>[\s\S]*?<label id="visibilityControl" for="visibilitySelect">\s*<select id="visibilitySelect" aria-label="Who can open it">\s*<option value="public" selected>Public<\/option>\s*<option value="private">Private<\/option>/);
    assert.match(app, /await uploadFile\(file, normalizePublishVisibility\(visibilitySelect\.value\)\);/);
    assert.match(app, /const driveUrl = isPrivate \? await getPrivatePublishDrive\(\) : await getOrCreateHyperdrive\(\);/);
    assert.match(app, /addPublishUrl\(publishUrl, \{ isPrivate \}\);/);
    // Only hyper:// has a private drive.
    assert.match(app, /visibilityControl\.classList\.remove\("hidden"\);[\s\S]*?visibilityControl\.classList\.add\("hidden"\);/);
  });
});
