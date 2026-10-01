// What notes-transfer.html runs. PeerSky calls these from outside the page,
// since the notes live in this app's own storage and nowhere else.
import { exportNotes, importNotes } from "./notes-transfer.js";

window.p2pmdNotes = {
  export: () => exportNotes(localStorage),
  import: (transfer) => importNotes(localStorage, transfer),
};
