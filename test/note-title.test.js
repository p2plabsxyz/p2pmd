// A list of keys tells you nothing about which note is which. These names are
// cosmetic, so the bar is that they are recognisable and never wrong in a way
// that matters: the key is still what opens the note.
//
// Mirrors test/platform/p2pmd-note-title.test.mjs in peersky-mobile.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  describeP2pmdNote,
  p2pmdNoteKind,
  p2pmdNoteTitle,
} from "../note-title.js";

describe("note titles", () => {
  it("names a note after its own heading", () => {
    assert.equal(p2pmdNoteTitle("# Quarterly plan\n\nbody text"), "Quarterly plan");
    assert.equal(p2pmdNoteTitle("### Deep heading"), "Deep heading");
    assert.equal(p2pmdNoteTitle("## Closing thoughts ##"), "Closing thoughts");
  });

  it("falls back to the first line someone actually typed", () => {
    assert.equal(p2pmdNoteTitle("\n\n   \nsecond line is the first real one"), "second line is the first real one");
    assert.equal(p2pmdNoteTitle(""), "");
    assert.equal(p2pmdNoteTitle("   \n  \n"), "");
    assert.equal(p2pmdNoteTitle(null), "");
  });

  it("shows the words, not the markdown around them", () => {
    assert.equal(p2pmdNoteTitle("# **Bold** and [a link](http://example.com) here"), "Bold and a link here");
    assert.equal(p2pmdNoteTitle("# `code` and ~~strike~~"), "code and strike");
    assert.equal(p2pmdNoteTitle("# <span>markup</span> too"), "markup too");
  });

  it("cuts a long heading down to one line", () => {
    const title = p2pmdNoteTitle(`# ${"word ".repeat(60)}`);
    assert.ok(title.length <= 51, title);
    assert.match(title, /\.\.\.$/);
  });

  it("tells the four kinds of note apart", () => {
    assert.equal(p2pmdNoteKind("<!-- ieee -->\n\n## A Sample Research Paper"), "paper");
    assert.equal(p2pmdNoteKind("# Welcome\n\nfirst slide\n\n---\n\n# Slide 2"), "slides");
    assert.equal(p2pmdNoteKind("## Technical Documentation: Sync Service"), "technical");
    assert.equal(p2pmdNoteKind("just some notes"), "note");
    assert.equal(p2pmdNoteKind(""), "note");
  });

  it("trusts the editor when it says the note is a deck", () => {
    assert.equal(p2pmdNoteKind("# My deck\n\none line only"), "note");
    assert.equal(p2pmdNoteKind("# My deck\n\none line only", { slides: true }), "slides");
  });

  it("does not mistake a table for a slide break", () => {
    // A table's separator row is dashes too. Splitting on it would call every
    // note with a table a presentation.
    const table = "# Results\n\n| Model | Score |\n| --- | ---: |\n| Baseline | 78% |\n";
    assert.equal(p2pmdNoteKind(table), "note");
  });

  it("builds a label from the kind and the name", () => {
    assert.equal(describeP2pmdNote("<!-- ieee -->\n\n## Lorem Ipsum").label, "Research paper - Lorem Ipsum");
    assert.equal(describeP2pmdNote("# Welcome\n\na\n\n---\n\nb").label, "Slides - Welcome");
    assert.equal(describeP2pmdNote("plain text").label, "Note - plain text");
    assert.equal(describeP2pmdNote("").label, "Note");
  });
});
